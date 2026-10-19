// 热度模块：引用数按天存一份、同一天重跑覆盖；榜单按「每天被引用多少次」排，撤稿的不在榜上。
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { beijingDate } from "@aihot/contracts/time";
import { sql, closeDb } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { setVisibility } from "@aihot/backend/admin/content";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../../../apps/api/src/app.ts";
import { collectPaperSignals, type OpenAlexWork } from "../collect.ts";
import { heatOf } from "../heat.ts";
import { loadPaperHeat } from "../read.ts";
import heat from "../server.ts";

const T = tag();
const SOURCE = `heat-test-${T}`;

installModules([heat]);
const app = await buildApp();

let n = 0;
/** 一篇已公开的论文，`work` 是它的 OpenAlex 作品编号（没有就当作查不到引用）。 */
async function paper(publishedAt: Date, work?: string): Promise<string> {
  n += 1;
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}-${n}`, title: `Heat paper ${n} ${T}`, author: "A. Author", language: "en",
    publishedAt, bodyText: `Abstract ${n} ${T}`, bodyStatus: "ok", via: "fetch", backfill: "test-archive",
    raw: work ? { openalex: { id: `https://openalex.org/${work}`, citedBy: 0 } } : {},
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'ai', ${`标题${n}-${T}`}, ${`摘要${n}-${T}`}, '理由', 80, true)`;
  await sql`UPDATE articles SET grouping_status = 'complete' WHERE id = ${articleId}`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  return articleId;
}

const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400_000);
/** 库里存着的引用数只按天存，测试直接写这两天的两行。 */
const signal = (articleId: string, day: string, cites: number) => sql`
  INSERT INTO paper_signals (article_id, day, cites) VALUES (${articleId}, ${day}::date, ${cites})
  ON CONFLICT (article_id, day) DO UPDATE SET cites = EXCLUDED.cites`;

let tracked = ""; // 有 OpenAlex 编号，采集会写它
let untracked = ""; // 没有编号，采集跳过它
let cited = ""; // 引用多、上线久
let rising = ""; // 引用少、上线近

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, interval_minutes, enabled, health, tags)
            VALUES (${SOURCE}, 'Heat test journal', 'external', 'T1', 'editorial', 1440, true, 'ok', ARRAY[]::text[])
            ON CONFLICT (id) DO NOTHING`;
  tracked = await paper(daysAgo(12), "W1000000001");
  untracked = await paper(daysAgo(12));
  cited = await paper(daysAgo(28));
  rising = await paper(daysAgo(6));
  // 8 天前有 28 条引用、今天 30 条：近 7 天 +2。
  await signal(cited, beijingDate(daysAgo(8)), 28);
  await signal(cited, beijingDate(now), 30);
  await signal(rising, beijingDate(now), 2);
});

after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

test("引用数按天存一条，同一天再跑一次只更新那一行", async () => {
  const seen: string[][] = [];
  let cites = 1;
  const fetch = async (ids: readonly string[]): Promise<OpenAlexWork[]> => {
    seen.push([...ids]);
    return [{ id: "https://openalex.org/W1000000001", cited_by_count: cites }];
  };
  const first = await collectPaperSignals({ now, fetch });
  assert.deepEqual(seen, [["W1000000001"]], "只有带 OpenAlex 编号的论文要查");
  assert.equal(first.written, 1);
  assert.equal(first.day, beijingDate(now));
  const rows = await sql<{ article_id: string; cites: number; days: number }[]>`
    SELECT article_id, sum(cites) AS cites, count(*) AS days FROM paper_signals WHERE article_id = ${tracked} GROUP BY article_id`;
  assert.deepEqual(rows.map((row) => [row.article_id, Number(row.cites), Number(row.days)]), [[tracked, 1, 1]]);
  assert.equal((await sql`SELECT 1 FROM paper_signals WHERE article_id = ${untracked}`).length, 0);

  cites = 2;
  await collectPaperSignals({ now, fetch });
  const again = await sql<{ cites: number; days: number }[]>`
    SELECT sum(cites) AS cites, count(*) AS days FROM paper_signals WHERE article_id = ${tracked}`;
  assert.deepEqual(again.map((row) => [Number(row.cites), Number(row.days)]), [[2, 1]], "同一天重跑不该多出一行");
});

test("一次都没拿到引用时这一轮算失败，不把缺数据当成零", async () => {
  const failing = async (): Promise<OpenAlexWork[]> => { throw new Error("OpenAlex answered 503"); };
  await assert.rejects(collectPaperSignals({ now, fetch: failing }), /OpenAlex answered 503/);
});

test("热度按每天被引用次数排：上线久但引用多的一篇在前", async () => {
  const heat = await loadPaperHeat(now);
  const ids = heat.entries.map((entry) => entry.item.id);
  assert.equal(ids[0], cited);
  assert.ok(ids.indexOf(cited) < ids.indexOf(rising), "引用多的排在前");
  assert.ok(ids.indexOf(rising) < ids.indexOf(tracked), "上线近、每天被引更多的一篇排在前面");
  assert.ok(ids.length >= 4);
  const top = heat.entries[0]!;
  assert.equal(top.rank, 1);
  assert.equal(top.cites, 30);
  assert.equal(top.growth7, 2);
  assert.equal(top.ageDays, 28);
  assert.equal(top.heat, 107.1);
  // 没有引用的排在有引用的后面；没有 OpenAlex 编号的那篇也照常出现在榜单里。
  const risingEntry = heat.entries.find((entry) => entry.item.id === rising)!;
  assert.equal(risingEntry.heat, 33.3);
  assert.equal(heat.entries.at(-1)!.item.id, untracked);
  assert.equal(heat.citedCount, 3);
});

test("讨论与代码有值时按 5:3:2 计入，缺的项不按零算", async () => {
  assert.equal(heatOf({ cites: 10, discussions: null, stars: null, ageDays: 10 }), 100);
  assert.equal(heatOf({ cites: 10, discussions: 5, stars: 0, ageDays: 10 }), 65);
  assert.equal(heatOf({ cites: 10, discussions: 5, stars: null, ageDays: 10 }), 81.3);
});

test("每天一次的采集挂在 worker 的定时任务上，采集关掉时不留任务", async () => {
  const schedule = heat.schedules?.[0];
  assert.equal(schedule?.name, "heat.papers");
  assert.equal(schedule?.cron, "40 6 * * *");
  const saved = process.env.COLLECT_ENABLED;
  try {
    process.env.COLLECT_ENABLED = "false";
    assert.equal(schedule?.when?.(), false);
    process.env.COLLECT_ENABLED = "true";
    assert.equal(schedule?.when?.(), true);
  } finally {
    if (saved === undefined) delete process.env.COLLECT_ENABLED;
    else process.env.COLLECT_ENABLED = saved;
  }
});

test("详情页按篇读被引数，没有信号或编号不对时没有这一行", async () => {
  const res = await app.inject({ method: "GET", url: `/api/heat/item/${cited}` });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.cites, 30);
  assert.equal(body.day, beijingDate(now));
  assert.equal((await app.inject({ method: "GET", url: `/api/heat/item/${untracked}` })).statusCode, 404, "没有信号");
  assert.equal((await app.inject({ method: "GET", url: "/api/heat/item/not%20an%20id" })).statusCode, 404, "不存在的编号");
});

test("撤稿的论文从榜单上下来，接口和它一致", async () => {
  await setVisibility(cited, { visibility: "withdrawn", reason: "test", version: 0 }, "test");
  const afterWithdraw = await loadPaperHeat(now);
  assert.equal(afterWithdraw.entries.some((entry) => entry.item.id === cited), false);
  assert.equal(afterWithdraw.entries[0]!.item.id, rising);

  const res = await app.inject({ method: "GET", url: "/api/heat/papers" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.windowDays, 30);
  assert.ok(Array.isArray(body.entries));
  assert.equal(body.entries.some((entry: { item: { id: string } }) => entry.item.id === cited), false);
  assert.equal(body.entries[0].rank, 1);
});
