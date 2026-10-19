// 每天从 OpenAlex 拉一次引用数，按北京时间的那一天写进 paper_signals。
// OpenAlex 免费：填了 OPENALEX_KEY（.env）额度更高，不填也能用共享额度。
import { beijingDate } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";

/** OpenAlex 一次按多少个 id 筛（多走几次，额度照算）。 */
const CHUNK = 25;
/** 只跟入库半年内的论文：再往前的引用涨落不再说明「最近」什么在升温。 */
const LOOKBACK_DAYS = 180;

export interface OpenAlexWork {
  id: string;
  cited_by_count: number;
}

/** 一次按至多 25 个 OpenAlex 作品 id 取引用数；测试里换成自己的实现，不连外网。 */
export type WorksFetch = (ids: readonly string[]) => Promise<OpenAlexWork[]>;

export const fetchWorks: WorksFetch = async (ids) => {
  const params = new URLSearchParams({
    filter: `openalex_id:${ids.join("|")}`,
    select: "id,cited_by_count",
    "per-page": String(ids.length),
  });
  const key = process.env.OPENALEX_KEY?.trim();
  const mailto = process.env.OPENALEX_MAILTO?.trim();
  if (key) params.set("api_key", key);
  if (mailto) params.set("mailto", mailto);
  const res = await guardedFetch(`https://api.openalex.org/works?${params}`, { timeoutMs: 30_000, maxBytes: 2 * 1024 * 1024 });
  if (res.status !== 200) throw new Error(`OpenAlex answered ${res.status}`);
  return (JSON.parse(res.text()) as { results?: OpenAlexWork[] }).results ?? [];
};

export interface CollectResult {
  /** 写进哪一天（北京时间）。 */
  day: string;
  /** 写进去的篇数。 */
  written: number;
  /** OpenAlex 没答上来的篇数（退出这一轮）。 */
  missing: number;
}

/**
 * 有 OpenAlex id 的论文（期刊脚本入库时写在 raw.openalex.id 上）的引用数，按天存一份。
 * 同一天再跑一次只更新那一行。
 */
export async function collectPaperSignals({ now = new Date(), fetch = fetchWorks }: { now?: Date; fetch?: WorksFetch } = {}): Promise<CollectResult> {
  const day = beijingDate(now);
  const articles = await sql<{ id: string; work: string }[]>`
    SELECT id, substring(raw->'openalex'->>'id' from '(W[0-9]+)$') AS work
    FROM articles
    WHERE raw->'openalex'->>'id' IS NOT NULL AND discovered_at > ${new Date(now.getTime() - LOOKBACK_DAYS * 86400_000)}
    ORDER BY discovered_at DESC`;
  const pending = articles.filter((article) => article.work);
  let written = 0;
  let missing = 0;
  const failures: string[] = [];
  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    let works: OpenAlexWork[];
    try {
      works = await fetch(chunk.map((article) => article.work));
    } catch (error) {
      failures.push((error as Error).message);
      missing += chunk.length;
      continue;
    }
    const cites = new Map(works.map((work) => [String(work.id).split("/").pop() ?? "", Number(work.cited_by_count) || 0]));
    const rows = chunk.flatMap((article) => (cites.has(article.work) ? [{ article_id: article.id, day, cites: cites.get(article.work)! }] : []));
    missing += chunk.length - rows.length;
    if (rows.length === 0) continue;
    await sql`INSERT INTO paper_signals ${sql(rows)}
      ON CONFLICT (article_id, day) DO UPDATE SET cites = EXCLUDED.cites, captured_at = now()`;
    written += rows.length;
  }
  // 一次都没答上来（网络断了、OpenAlex 挂了）：让这一轮算失败，job_runs 里看得见，不要安静地当成「引用没涨」。
  if (failures.length && written === 0 && pending.length > 0) throw new Error(`OpenAlex failed: ${failures[0]}`);
  return { day, written, missing };
}
