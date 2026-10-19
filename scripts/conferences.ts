// 会议论文：按 industry/conferences.json 里的会议名，在 arXiv 的备注（comment）里找
// “Accepted at NeurIPS 2026”这类记录，把最近 N 天提交的论文按普通材料入库，交给 worker 写中文精读。
//
//   node --env-file=.env scripts/conferences.ts --days=45
//   node --env-file=.env scripts/conferences.ts --slug=neurips --dry
//
// arXiv 的正式论文集常常滞后，备注是公开可查的替代线索；这里只收备注里明确提到会议的，
// 排除 workshop、under review、submitted to 之类的字样。
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";

interface Conference {
  slug: string;
  name: string;
  discipline: string;
  query: string;
  /** When set, the comment must also match this pattern (ICLR before decisions: only accepted ones). */
  require?: string;
  exclude?: string[];
}

interface ArxivEntry {
  id: string;
  url: string;
  title: string;
  abstract: string;
  authors: string;
  publishedAt: string;
  comment: string;
  categories: string[];
}

const argv = process.argv.slice(2);
const flag = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const days = Math.min(Math.max(Number(flag("days") ?? 45), 1), 365);
const onlySlug = flag("slug");
const dry = argv.includes("--dry");
const maxResults = Math.min(Math.max(Number(flag("max") ?? 100), 1), 200);

const { conferences } = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry", "conferences.json"), "utf8")) as { conferences: Conference[] };
const todo = onlySlug ? conferences.filter((conference) => conference.slug === onlySlug) : conferences;
if (todo.length === 0) throw new Error(`no conference with slug ${onlySlug}`);

const decodeXml = (value: string) => value
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&amp;/g, "&");

const tag = (xml: string, name: string) => {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decodeXml(match[1]!).replace(/\s+/g, " ").trim() : "";
};

/** arXiv Atom 的条目：编号、标题、摘要、作者、提交时间、备注和分类。 */
export function parseArxivFeed(xml: string): ArxivEntry[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
    const entry = match[1]!;
    const id = tag(entry, "id").replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/v\d+$/, "");
    const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]
      .map((author) => decodeXml(author[1]!).trim()).filter(Boolean).slice(0, 8).join(", ");
    const categories = [...entry.matchAll(/<category[^>]*term="([^"]+)"/g)].map((category) => category[1]!);
    return {
      id,
      url: `https://arxiv.org/abs/${id}`,
      title: tag(entry, "title"),
      abstract: tag(entry, "summary"),
      authors,
      publishedAt: tag(entry, "published"),
      comment: /<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/.exec(entry)?.[1]
        ? decodeXml(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/.exec(entry)![1]!).replace(/\s+/g, " ").trim()
        : "",
      categories,
    };
  });
}

/** 备注里提到这个会议、且不在排除清单里的条目。 */
export function wantedByConference(entry: ArxivEntry, conference: Conference): boolean {
  const comment = entry.comment.toLowerCase();
  if (!entry.id || !entry.title) return false;
  if (!comment.includes(conference.name.toLowerCase())) return false;
  if (conference.require && !new RegExp(conference.require, "i").test(entry.comment)) return false;
  return !(conference.exclude ?? []).some((word) => comment.includes(word.toLowerCase()));
}

const from = new Date(Date.now() - days * 86400_000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** arXiv 偶尔连不上：三次退避重试，仍失败就跳过这个会议，不让整轮脚本崩掉。 */
async function fetchFeed(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "ThesisNHBot/1.0 (conferences script)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      console.error(`arXiv fetch failed (attempt ${attempt + 1}): ${(error as Error).message}`);
      await sleep(5000 * (attempt + 1));
    }
  }
  return null;
}

async function ensureSource(conference: Conference): Promise<string> {
  const id = `conference-${conference.slug}`;
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, enabled, health, tags)
    VALUES (${id}, ${`${conference.name} · arXiv`}, 'external', '{}'::jsonb, 'T1', 'editorial', 1440, true, 'ok', ${[conference.discipline]})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`;
  return id;
}

let created = 0;
let revised = 0;
let skipped = 0;
let matched = 0;

for (const conference of todo) {
  const params = new URLSearchParams({
    search_query: `co:"${conference.query}"`,
    sortBy: "submittedDate",
    sortOrder: "descending",
    max_results: String(maxResults),
  });
  const feed = await fetchFeed(`https://export.arxiv.org/api/query?${params}`);
  if (!feed) {
    console.error(`${conference.name}: skipped`);
    continue;
  }
  const entries = parseArxivFeed(feed)
    .filter((entry) => wantedByConference(entry, conference))
    .filter((entry) => Date.parse(entry.publishedAt) >= from.getTime());
  matched += entries.length;
  const sourceId = dry ? `conference-${conference.slug}` : await ensureSource(conference);
  let n = 0;
  for (const entry of entries) {
    if (dry) {
      console.log(`- ${entry.publishedAt.slice(0, 10)} ${entry.title.slice(0, 80)} | ${entry.comment.slice(0, 60)}`);
      n += 1;
      continue;
    }
    // 同一篇论文可能已由 arXiv 信源收过（URL 带版本号）；不再按会议重复入库。
    const [existing] = await sql`SELECT id FROM articles
      WHERE url ~ ${"^https?://arxiv\\.org/abs/" + entry.id.replace(/\./g, "\\.") + "(v[0-9]+)?$"} LIMIT 1`;
    if (existing) {
      skipped += 1;
      continue;
    }
    const saved = await upsertMaterial({
      sourceId,
      url: entry.url,
      title: entry.title,
      author: entry.authors || null,
      language: "en",
      publishedAt: new Date(entry.publishedAt),
      excerpt: entry.abstract.slice(0, 600) || null,
      bodyText: entry.abstract,
      bodyStatus: entry.abstract ? "ok" : "none",
      via: "fetch",
      raw: {
        arxiv: {
          id: entry.id,
          comment: entry.comment,
          categories: entry.categories,
          conference: conference.name,
        },
      },
    });
    if (saved.created) created += 1;
    else if (saved.revised) revised += 1;
    else skipped += 1;
    if (saved.created || saved.revised) {
      await Promise.race([queueProcessing(saved.articleId).catch(() => null), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    n += 1;
  }
  console.log(`${conference.name}: ${n} 篇（新增 ${created}、修订 ${revised}、已有 ${skipped}）`);
  await sleep(3000);
}

if (!dry) await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id LIKE 'conference-%'`;
await stopBoss().catch(() => null);
await closeDb();
console.log(dry ? `dry run: ${matched} 篇符合条件` : `done: matched ${matched}, created ${created}, revised ${revised}, unchanged ${skipped}`);
