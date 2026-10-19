// 论文热度的公开读取：公开论文里最近 30 天上线的，有信号的那些按热度排。
import { beijingDate } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import { cached } from "@aihot/backend/lib/cache";
import { listedItems } from "@aihot/backend/publication/items";
import { listedCondition } from "@aihot/backend/publication/scope";
import { heatOf } from "./heat.ts";
import type { HeatHome, PaperHeatEntry, PaperHeatResponse, PaperSignal } from "./types.ts";

/** 只收上线这么多天以内的论文。 */
export const WINDOW_DAYS = 30;
/** 榜单最多这么长；其余在全部动态里翻。 */
const LIMIT = 30;

interface SignalRow {
  id: string;
  published_at: Date | null;
  timeline_at: Date;
  cites: number;
  discussions: number | null;
  stars: number | null;
  cites_week_ago: number | null;
}

// 引用一天才变一次；5 分钟读一次，采集跑完一轮就能在页面上看到。
const cache = cached(() => readPaperHeat(new Date()), { freshMs: 300_000, maxStaleMs: 300_000 });

const HOME_COUNT = 5;

/** 首页的两栏：左边最热（没有引用时退到近 7 天增长最快的），右边最新入库的公开论文。 */
export async function loadHeatHome(now: Date = new Date()): Promise<HeatHome> {
  const board = await loadPaperHeat(now);
  const byHeat = board.entries.filter((entry) => entry.cites > 0).slice(0, HOME_COUNT);
  const byGrowth = board.entries
    .filter((entry) => (entry.growth7 ?? 0) > 0)
    .sort((a, b) => (b.growth7 ?? 0) - (a.growth7 ?? 0) || b.cites - a.cites)
    .slice(0, HOME_COUNT);
  const mode = byHeat.length ? "heat" : byGrowth.length ? "growth" : "none";
  const hot = mode === "heat" ? byHeat : mode === "growth" ? byGrowth : [];
  const newest = await sql<{ id: string }[]>`
    SELECT p.article_id AS id FROM publications p
    WHERE ${listedCondition(now)} ORDER BY p.timeline_at DESC LIMIT ${HOME_COUNT}`;
  const items = await listedItems(newest.map((row) => row.id), now);
  return { mode, hot, latest: newest.flatMap((row) => items.get(row.id) ?? []) };
}

/** 给了 `now` 就直接读（测试与回放），不进进程里的缓存。 */
export function loadPaperHeat(now?: Date): Promise<PaperHeatResponse> {
  return now ? readPaperHeat(now) : cache.get();
}

/** 一篇公开论文最近一次采集到的引用数；没有信号或已不再公开时是 null。 */
export async function loadPaperSignal(id: string, now: Date = new Date()): Promise<PaperSignal | null> {
  const [row] = await sql<{ cites: number; day: string; captured_at: Date }[]>`
    SELECT s.cites, s.day::text AS day, s.captured_at
    FROM paper_signals s JOIN publications p ON p.article_id = s.article_id
    WHERE s.article_id = ${id} AND ${listedCondition(now)}
    ORDER BY s.day DESC LIMIT 1`;
  return row ? { cites: Number(row.cites), day: row.day, capturedAt: row.captured_at.toISOString() } : null;
}

async function readPaperHeat(now: Date): Promise<PaperHeatResponse> {
  const series = await sql<SignalRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (s.article_id) s.article_id, s.cites, s.discussions, s.stars
      FROM paper_signals s ORDER BY s.article_id, s.day DESC
    ), week_ago AS (
      SELECT DISTINCT ON (s.article_id) s.article_id, s.cites
      FROM paper_signals s WHERE s.day <= ${beijingDate(new Date(now.getTime() - 7 * 86400_000))}::date
      ORDER BY s.article_id, s.day DESC
    ), reports AS (
      SELECT p.fact_id, count(DISTINCT p.source_id)::int AS n
      FROM publications p WHERE p.fact_id IS NOT NULL AND ${listedCondition(now)}
      GROUP BY p.fact_id
    )
    SELECT p.article_id AS id, p.published_at, p.timeline_at, coalesce(l.cites, 0) AS cites, l.stars, w.cites AS cites_week_ago,
      CASE WHEN r.n IS NULL THEN NULL ELSE r.n - 1 END AS discussions
    FROM publications p
    LEFT JOIN latest l ON l.article_id = p.article_id
    LEFT JOIN week_ago w ON w.article_id = p.article_id
    LEFT JOIN reports r ON r.fact_id = p.fact_id
    WHERE ${listedCondition(now)} AND p.timeline_at >= ${new Date(now.getTime() - WINDOW_DAYS * 86400_000)}`;
  // 卡片从公开读取层来：撤稿或不再公开的在这里就是缺的。
  const items = await listedItems(series.map((row) => row.id), now);
  const entries = series.flatMap((row): PaperHeatEntry[] => {
    const item = items.get(row.id);
    if (!item) return [];
    const at = row.published_at ?? row.timeline_at;
    const ageDays = Math.max(1, Math.floor((now.getTime() - at.getTime()) / 86400_000));
    const cites = Number(row.cites);
    const discussions = Number(row.discussions ?? 0);
    const stars = Number(row.stars ?? 0);
    return [{
      rank: 0,
      item,
      heat: heatOf({ cites, discussions: row.discussions === null ? null : discussions, stars: row.stars === null ? null : stars, ageDays }),
      cites,
      growth7: row.cites_week_ago === null ? null : cites - Number(row.cites_week_ago),
      discussions,
      stars,
      ageDays,
      publishedAt: row.published_at?.toISOString() ?? null,
    }];
  });
  entries.sort((a, b) => b.heat - a.heat || b.cites - a.cites || b.item.timelineAt.localeCompare(a.item.timelineAt));
  return {
    computedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    citedCount: entries.filter((entry) => entry.cites > 0).length,
    entries: entries.slice(0, LIMIT).map((entry, index) => ({ ...entry, rank: index + 1 })),
  };
}
