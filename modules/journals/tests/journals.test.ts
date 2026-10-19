// 期刊模块：单刊页、按刊 RSS 和首页区块都只列公开的论文，且只列这本刊的；撤稿的不出现。
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { setVisibility } from "@aihot/backend/admin/content";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../../../apps/api/src/app.ts";
import journals from "../server.ts";
import { loadJournalHome } from "../read.ts";
import { journals as registry } from "../registry.ts";

const T = tag();
const RSE = "0034-4257";
const FUEL = "0016-2361";
const sourceOf = (issn: string) => `journal-${issn}`;

installModules([journals]);
const app = await buildApp();

let rseToday = "";
let fuelToday = "";
let rseYesterday = "";

before(async () => {
  for (const [issn, name] of [[RSE, "Remote Sensing of Environment"], [FUEL, "Fuel"]]) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, interval_minutes, enabled, health, tags)
              VALUES (${sourceOf(issn)}, ${name}, 'external', 'T1', 'editorial', 1440, true, 'ok', ARRAY[]::text[])
              ON CONFLICT (id) DO NOTHING`;
  }
  rseToday = await paper(sourceOf(RSE), new Date());
  fuelToday = await paper(sourceOf(FUEL), new Date());
  // 当天往前 26 小时：按发布时间排到昨天，首页区块的「今天」不该把它算进来。
  rseYesterday = await paper(sourceOf(RSE), new Date(Date.now() - 26 * 3600_000), "test-archive");
});

after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

let n = 0;
/** 一篇已公开的论文（分析结果选了它，发布完成）；`backfill` 让它按原文的发布时间排（历史的）那一天。 */
async function paper(sourceId: string, publishedAt: Date, backfill?: string): Promise<string> {
  n += 1;
  const { articleId } = await upsertMaterial({
    sourceId, url: `https://example.com/${T}-${n}`, title: `Paper ${n} ${T}`, author: "A. Author", language: "en",
    publishedAt, bodyText: `Abstract ${n} ${T}`, bodyStatus: "ok", via: "fetch", backfill,
    raw: { openalex: { id: `https://openalex.org/W${n}`, citedBy: 0, issn: sourceId.slice("journal-".length) } },
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'rs', ${`标题${n}-${T}`}, ${`摘要${n}-${T}`}, '理由', 80, true)`;
  await sql`UPDATE articles SET grouping_status = 'complete' WHERE id = ${articleId}`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  return articleId;
}

const get = (url: string) => app.inject({ method: "GET", url });

test("单刊页只列这本刊已公开的论文", async () => {
  const res = await get(`/api/journal/${RSE}`);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.journal.issn, RSE);
  assert.equal(body.journal.name, "Remote Sensing of Environment");
  assert.equal(body.journal.total, 2);
  const ids = body.items.map((item: { id: string }) => item.id);
  assert.deepEqual(new Set(ids), new Set([rseToday, rseYesterday]));
  assert.equal(ids.includes(fuelToday), false, "另一本刊的论文不该出现");
  // 最近一篇在前。
  assert.equal(body.items[0].id, rseToday);
});

test("清单里没有的 ISSN 没有单刊页，也没有订阅", async () => {
  assert.equal((await get("/api/journal/9999-9999")).statusCode, 404);
  assert.equal((await get("/feed/journal/9999-9999.xml")).statusCode, 404);
});

test("按刊 RSS 只含这本刊的论文，并带原文链接", async () => {
  const res = await get(`/feed/journal/${RSE}.xml`);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] as string, /application\/rss\+xml/);
  assert.match(res.body, new RegExp(rseToday));
  assert.match(res.body, new RegExp(rseYesterday));
  assert.doesNotMatch(res.body, new RegExp(fuelToday));
  assert.match(res.body, /阅读原文/);
  assert.match(res.body, new RegExp(`https://example.com/${T}-1`));
  // 没有这条条件的请求会一直读完整个源：ETag 让重复订阅拿到 304。
  const again = await app.inject({ method: "GET", url: `/feed/journal/${RSE}.xml`, headers: { "if-none-match": res.headers.etag as string } });
  assert.equal(again.statusCode, 304);
});

test("首页区块把今天上线的算进一区期刊，昨天的不算", async () => {
  const now = new Date();
  const home = await loadJournalHome(now);
  assert.equal(home.live, true);
  assert.equal(home.omitted, 0);
  assert.ok(home.todayNew >= 2);
  const rse = home.journals.find((entry) => entry.journal.issn === RSE);
  assert.ok(rse, "今天有更新的 RSE 该出现在区块里");
  assert.deepEqual(rse!.items.map((item) => item.id), [rseToday]);
  const fuel = home.journals.find((entry) => entry.journal.issn === FUEL);
  assert.deepEqual(fuel?.items.map((item) => item.id), [fuelToday]);
  // 今天没有新论文时（这里是昨天），区块退到最近一次更新的那天，而不是空着。
  const past = new Date(now.getTime() + 24 * 3600_000);
  const later = await loadJournalHome(past);
  assert.equal(later.live, false);
  assert.equal(later.day, home.today);
  assert.ok(later.journals.some((entry) => entry.journal.issn === RSE));

  // 接口给网页的就是这份数据。
  const res = await get("/api/journal/home");
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).today, home.today);
});

test("撤稿的论文不再出现在单刊页、订阅和首页区块里", async () => {
  await setVisibility(rseToday, { visibility: "withdrawn", reason: "test", version: 0 }, "test");
  const page = JSON.parse((await get(`/api/journal/${RSE}`)).body);
  assert.deepEqual(page.items.map((item: { id: string }) => item.id), [rseYesterday]);
  assert.equal(page.journal.total, 1);
  assert.doesNotMatch((await get(`/feed/journal/${RSE}.xml`)).body, new RegExp(rseToday));
  const home = await loadJournalHome(new Date());
  assert.equal(home.journals.find((entry) => entry.journal.issn === RSE), undefined);
});

test("一区期刊很多时首页只列六本，其余用 omitted 交代", async () => {
  // 清单里有 51 本一区刊：取前 7 本（除上面两本）今天各上一篇，Fuel 也还有今天的。
  const extra = registry().filter((journal) => journal.tier === "T1" && journal.issn !== RSE && journal.issn !== FUEL).slice(0, 7);
  assert.equal(extra.length, 7);
  for (const journal of extra) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, interval_minutes, enabled, health, tags)
              VALUES (${journal.sourceId}, ${journal.name}, 'external', 'T1', 'editorial', 1440, true, 'ok', ARRAY[]::text[])
              ON CONFLICT (id) DO NOTHING`;
    await paper(journal.sourceId, new Date());
  }
  const home = await loadJournalHome(new Date());
  assert.equal(home.live, true);
  assert.equal(home.journals.length, 6);
  // 今天有更新的：Fuel + 这 7 本 = 8 本。
  assert.equal(home.omitted, 2);
});
