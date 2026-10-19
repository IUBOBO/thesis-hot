// Pulls the newest papers of the journals in industry/journals.json from OpenAlex and stores them as
// material with the abstract as body text, so the normal analysis pipeline can write the Chinese digest.
//
//   node --env-file=.env scripts/journals.ts --days=14
//   node --env-file=.env scripts/journals.ts --issn=0162-8828,0098-5589
//   node --env-file=.env scripts/journals.ts --issn=0034-4257 --dry
//
// OpenAlex is free (an API key raises the daily budget): https://openalex.org/settings/api
// Pass the key with OPENALEX_KEY in .env; without it the request still works on the shared budget.
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";

interface Journal {
  issn: string;
  name: string;
  discipline: string;
  tier: string;
}

interface OpenAlexWork {
  id: string;
  doi: string | null;
  title: string | null;
  publication_date: string | null;
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    institutions?: Array<{ display_name?: string | null } | null> | null;
  }>;
  primary_location?: { source?: { display_name?: string | null } | null } | null;
  biblio?: { volume?: string | null; issue?: string | null } | null;
  open_access?: { is_oa?: boolean | null } | null;
}

const argv = process.argv.slice(2);
const flag = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const days = Number(flag("days") ?? 45);
const perJournal = Math.min(Math.max(Number(flag("max") ?? 50), 1), 50);
const onlyIssn = flag("issn")?.split(",").map((issn) => issn.trim().toLowerCase()).filter(Boolean) ?? null;
const dry = argv.includes("--dry");
const key = process.env.OPENALEX_KEY?.trim();
// OpenAlex 的“礼貌池”：带上联系邮箱，请求更容易进优先队列（不填也能用）。
const mailto = process.env.OPENALEX_MAILTO?.trim();

const { journals } = JSON.parse(readFileSync(path.join(REPO_ROOT, "industry", "journals.json"), "utf8")) as { journals: Journal[] };
const todo = onlyIssn ? journals.filter((j) => onlyIssn.includes(j.issn.toLowerCase())) : journals;
if (todo.length === 0) throw new Error(`no journal with issn ${onlyIssn?.join(",")}`);

/** OpenAlex stores the abstract word by word with positions; put it back in order. */
function abstractOf(inverted: Record<string, number[]> | null | undefined): string | null {
  if (!inverted) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inverted)) for (const at of positions) words[at] = word;
  const text = words.filter(Boolean).join(" ").trim();
  return text ? text : null;
}

const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The source row the papers hang off; kind "external" because this script does the fetching. */
async function ensureSource(j: Journal): Promise<string> {
  const id = `journal-${j.issn.toLowerCase()}`;
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, enabled, health, tags)
    VALUES (${id}, ${j.name}, 'external', '{}'::jsonb, ${j.tier}, 'editorial', 1440, true, 'ok', ${[j.discipline]})
    ON CONFLICT (id) DO NOTHING`;
  return id;
}

let created = 0;
let revised = 0;
let skipped = 0;

for (const j of todo) {
  const sourceId = dry ? `journal-${j.issn.toLowerCase()}` : await ensureSource(j);
  const params = new URLSearchParams({
    filter: `primary_location.source.issn:${j.issn},from_publication_date:${from}`,
    sort: "publication_date:desc",
    "per-page": String(perJournal),
    select: "id,doi,title,publication_date,cited_by_count,abstract_inverted_index,authorships,primary_location,biblio,open_access",
  });
  if (key) params.set("api_key", key);
  if (mailto) params.set("mailto", mailto);
  const res = await fetch(`https://api.openalex.org/works?${params}`, { headers: { "user-agent": `ThesisNHBot/1.0 (journals script${mailto ? `; mailto:${mailto}` : ""})` }, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) {
    console.error(`${j.name}: HTTP ${res.status}`);
    continue;
  }
  const body = (await res.json()) as { results?: OpenAlexWork[] };
  const works = (body.results ?? []).filter(
    (w) => w.doi && w.title && !/^(editorial board|corrigendum|erratum|retraction|contents?|preface|foreword|editorial|index)\b/i.test(w.title),
  );
  let n = 0;
  for (const w of works) {
    const abstract = abstractOf(w.abstract_inverted_index);
    // 没有摘要的条目写不出精读，分析会一直等材料；直接跳过。
    if (!abstract) { skipped += 1; continue; }
    const authors = (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean).slice(0, 8).join(", ");
    // 机构去重后最多存四个：详情页只在一行里展示。
    const institutions = [...new Set((w.authorships ?? []).flatMap((a) => (a.institutions ?? []).map((i) => i?.display_name)).filter(Boolean))]
      .slice(0, 4).join("、");
    if (dry) {
      console.log(`- ${w.publication_date} ${w.title?.slice(0, 70)} | abstract ${abstract ? `${abstract.length} 字` : "缺"}`);
      n += 1;
      continue;
    }
    const saved = await upsertMaterial({
      sourceId,
      url: w.doi!,
      title: w.title!,
      author: authors || null,
      language: "en",
      publishedAt: w.publication_date ? new Date(`${w.publication_date}T00:00:00Z`) : null,
      excerpt: abstract ? abstract.slice(0, 600) : null,
      bodyText: abstract,
      bodyStatus: abstract ? "ok" : "none",
      via: "fetch",
      raw: {
        openalex: {
          id: w.id, citedBy: w.cited_by_count ?? null, journal: w.primary_location?.source?.display_name ?? j.name, issn: j.issn, discipline: j.discipline,
          volume: w.biblio?.volume ?? null, issue: w.biblio?.issue ?? null, institutions: institutions || null, isOa: w.open_access?.is_oa ?? null,
        },
      },
    });
    if (saved.created) created += 1;
    else if (saved.revised) revised += 1;
    else skipped += 1;
    // 队列由 worker 启动时创建；没有 worker 时不让脚本卡在入队上。
    if (saved.created || saved.revised) {
      await Promise.race([queueProcessing(saved.articleId).catch(() => null), new Promise((r) => setTimeout(r, 5000))]);
    }
    n += 1;
  }
  console.log(`${j.name}: ${n} 篇（新增 ${created}、修订 ${revised}、已有 ${skipped}）`);
  await sleep(400);
}

if (!dry) await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id LIKE 'journal-%'`;
await closeDb();
console.log(dry ? "dry run" : `done: created ${created}, revised ${revised}, unchanged ${skipped}`);
