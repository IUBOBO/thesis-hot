// The 全部 list's narrower filters: journal papers and arXiv preprints are told apart by the import's
// record and the address, open access comes from the publisher's record, and recency is measured from
// when a paper was published (or first seen when the source has no date).
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `test-pool-filters-${T}`;
const app = await buildApp();

let n = 0;
async function paper(input: { url: string; category: string; daysAgo: number; openalex?: Record<string, unknown> }): Promise<string> {
  n += 1;
  const at = new Date(Date.now() - input.daysAgo * 86400_000);
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: input.url, title: `Filtered paper ${n} ${T}`, bodyText: `Abstract ${n} ${T}`, bodyStatus: "ok",
    via: "fetch", publishedAt: at,
    raw: input.openalex ? { openalex: input.openalex } : {},
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', ${input.category}, ${`标题${n}-${T}`}, '摘要', '理由', 80, true)`;
  await sql`UPDATE articles SET grouping_status = 'complete' WHERE id = ${articleId}`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  return articleId;
}

const get = async (query: string) => {
  const res = await app.inject({ method: "GET", url: `/api/site/pool?${query}` });
  return { status: res.statusCode, body: res.statusCode === 200 ? JSON.parse(res.body) : res.body };
};

let journalOpen = "";
let journalClosed = "";
let preprint = "";
let blog = "";

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
            VALUES (${SOURCE}, 'Filter fixture', 'rss', 'T1', 'editorial', '2100-01-01')`;
  journalOpen = await paper({ url: `https://doi.org/10.1016/j.fuel.2026.${T}1`, category: "rs", daysAgo: 1, openalex: { journal: "Fuel", isOa: true } });
  journalClosed = await paper({ url: `https://doi.org/10.1016/j.fuel.2026.${T}2`, category: "rs", daysAgo: 10, openalex: { journal: "Fuel", isOa: false } });
  preprint = await paper({ url: `https://arxiv.org/abs/2601.${T}`, category: "cs", daysAgo: 1 });
  blog = await paper({ url: `https://example.org/${T}/post`, category: "ai", daysAgo: 1 });
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});


test("journal papers and preprints are separated, and open access follows the publisher record", async () => {
  const ids = async (query: string) => ((await get(query)).body.items as Array<{ id: string }>).map((item) => item.id).sort();
  assert.deepEqual(await ids("kind=paper"), [journalOpen, journalClosed].sort());
  assert.deepEqual(await ids("kind=preprint"), [preprint]);
  assert.deepEqual(await ids("oa=1"), [journalOpen]);
  assert.deepEqual(await ids("oa=0"), [journalClosed]);
  assert.deepEqual(await ids("kind=paper&oa=1"), [journalOpen]);
  // A post that is neither a journal record nor an arXiv preprint is left out of both kinds.
  assert.ok(!(await ids("kind=paper")).includes(blog));
  assert.ok(!(await ids("kind=preprint")).includes(blog));
});

test("recency counts from the publication date and combines with the other filters", async () => {
  const ids = async (query: string) => ((await get(query)).body.items as Array<{ id: string }>).map((item) => item.id).sort();
  assert.deepEqual(await ids("within=7"), [journalOpen, preprint, blog].sort(), "the ten-day-old paper drops out");
  assert.deepEqual(await ids("within=7&kind=paper"), [journalOpen]);
  assert.deepEqual(await ids("within=365&kind=paper").then((list) => list.length), 2);
});

test("the filters stay in the answer and an unknown value is refused", async () => {
  const { body } = await get("kind=preprint&oa=1&within=30");
  assert.equal(body.filters.kind, "preprint");
  assert.equal(body.filters.oa, true);
  assert.equal(body.filters.within, 30);
  assert.equal((await get("kind=pdf")).status, 400);
  assert.equal((await get("within=14")).status, 400);
});
