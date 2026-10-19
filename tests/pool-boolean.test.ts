// Boolean search: AND (or plain words), OR and NOT, in both time and relevance order.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `test-pool-boolean-${T}`;
const app = await buildApp();

let both = "";
let remoteOnly = "";
let spectralOnly = "";

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
            VALUES (${SOURCE}, 'Boolean fixture', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const make = async (title: string, summary: string) => {
    const { articleId } = await upsertMaterial({
      sourceId: SOURCE, url: `https://example.com/${T}/${title.replace(/\W/g, "-")}`, title,
      bodyText: `${summary} ${T}`, bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
    });
    await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
              VALUES (${articleId}, 1, 'rule', 'pass', 'rs', ${title}, ${summary}, '理由', 80, true)`;
    await sql`UPDATE articles SET grouping_status = 'complete' WHERE id = ${articleId}`;
    await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
    return articleId;
  };
  both = await make(`alpha remote sensing ${T}`, `beta spectral ${T}`);
  remoteOnly = await make(`gamma remote ${T}`, `unrelated ${T}`);
  spectralOnly = await make(`delta spectral ${T}`, `unrelated ${T}`);
});

after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

async function ids(query: string, tab = "time"): Promise<{ total: number; ids: string[] }> {
  const res = await app.inject({ method: "GET", url: `/api/site/pool?q=${encodeURIComponent(query)}&tab=${tab}` });
  assert.equal(res.statusCode, 200, res.body);
  const body = JSON.parse(res.body);
  return { total: body.total, ids: (body.items as Array<{ id: string }>).map((item) => item.id) };
}

test("OR takes either group, AND takes both, NOT excludes", async () => {
  const or = await ids("alpha OR delta");
  assert.deepEqual(new Set(or.ids), new Set([both, spectralOnly]));
  assert.equal(or.total, 2);

  const and = await ids("remote spectral");
  assert.deepEqual(and.ids, [both], "plain words are AND");

  assert.equal((await ids("alpha NOT beta")).total, 0);
  const excluded = await ids("remote NOT spectral");
  assert.deepEqual(excluded.ids, [remoteOnly]);

  assert.equal((await ids("remote AND spectral")).total, 1);
  assert.equal((await ids("remote OR spectral")).total, 3);
});

test("relevance order applies the same boolean filter", async () => {
  const time = await ids("remote OR spectral");
  const relevance = await ids("remote OR spectral", "relevance");
  assert.equal(relevance.total, time.total);
  assert.deepEqual(new Set(relevance.ids), new Set(time.ids));
  assert.equal((await ids("alpha NOT beta", "relevance")).total, 0);
});

test("a lowercase operator is an ordinary word", async () => {
  // "or" in lower case is a search word here, so nothing matches the three words together.
  assert.equal((await ids("alpha or delta")).total, 0);
});
