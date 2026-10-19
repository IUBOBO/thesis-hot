// 期刊页与首页区块的公开读取：都走 public/pool 这一层，哪篇能公开由它决定。
// 成本上只做两类查询：一次按信源分组的计数（全部期刊一起），以及首页真正要显示的那几本刊的条目。
import { beijingDate, beijingMidnight } from "@aihot/contracts/time";
import type { PoolResponse } from "@aihot/contracts/site";
import { cached } from "@aihot/backend/lib/cache";
import { loadPool, loadSourceTotals, type PoolQuery } from "@aihot/backend/publication/pool";
import { firstTier, journalOf, journals } from "./registry.ts";
import type { JournalEntry, JournalHome, JournalPage, JournalRef, JournalsIndex } from "./types.ts";

/** 期刊的论文按站内时间排，不带频道、分类与标签筛选。 */
const SCOPE = { channel: "all", category: null, tag: null } as const;

/** 首页最多列几本刊：53 本刊全挤进来会把时间线挤没，其余去期刊目录。 */
const HOME_JOURNALS = 6;
/** 首页每本刊最多放几篇（今天有更新时；退到最近一天时少一篇）。 */
const HOME_ITEMS = 3;

function query(scope: Pick<PoolQuery, "source" | "since" | "page">, now: Date): PoolQuery {
  return { ...SCOPE, ...scope, now };
}

function entryOf(journal: JournalRef, pool: PoolResponse): JournalEntry {
  return { ...journal, total: pool.total, latestAt: pool.items[0]?.timelineAt ?? null };
}

// 目录页 5 分钟读一次；首页区块 1 分钟一次（今天的篇数要跟得上当天收录）。
const indexCache = cached(() => readIndex(new Date()), { freshMs: 300_000, maxStaleMs: 300_000 });
const homeCache = cached(() => readHome(new Date()), { freshMs: 60_000, maxStaleMs: 60_000 });

/** 期刊目录：每本刊已公开多少篇、最近一篇是什么时候。给了 `now` 就直接读（测试与回放）。 */
export function loadJournalsIndex(now?: Date): Promise<JournalsIndex> {
  return now ? readIndex(now) : indexCache.get();
}

/** 单刊的一页论文；不在清单里的 ISSN 是 null。 */
export async function loadJournalPage(issn: string, page: number, now = new Date()): Promise<JournalPage | null> {
  const journal = journalOf(issn);
  if (!journal) return null;
  const pool = await loadPool(query({ source: journal.sourceId, page }, now));
  return { ...pool, journal: entryOf(journal, pool) };
}

/** 首页区块：今天新上线多少篇（所有信源），以及今天有更新的一区期刊各几篇。 */
export function loadJournalHome(now?: Date): Promise<JournalHome> {
  return now ? readHome(now) : homeCache.get();
}

async function readIndex(now: Date): Promise<JournalsIndex> {
  const list = journals();
  const totals = await loadSourceTotals({ sourceIds: list.map((journal) => journal.sourceId) }, now);
  return {
    journals: list.map((journal) => {
      const total = totals.get(journal.sourceId);
      return { ...journal, total: total?.total ?? 0, latestAt: total?.latestAt?.toISOString() ?? null };
    }),
  };
}

async function readHome(now: Date): Promise<JournalHome> {
  const today = beijingDate(now);
  const midnight = beijingMidnight(today);
  const tierOne = firstTier();
  const ids = tierOne.map((journal) => journal.sourceId);
  // 今天每本刊几篇：一次分组查询；今天新上线多少篇（所有信源）另算一次。
  const [all, todayTotals] = await Promise.all([
    loadPool(query({ since: midnight, page: 1 }, now)),
    loadSourceTotals({ sourceIds: ids, since: midnight }, now),
  ]);
  const live = tierOne
    .map((journal) => ({ journal, total: todayTotals.get(journal.sourceId)?.total ?? 0 }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);
  if (live.length > 0) return homeOf(today, all.total, today, true, live, now);
  // 今天（周末、节假日）没有新论文：改说最近一次有更新的那一天，不让首页空着。
  const totals = await loadSourceTotals({ sourceIds: ids }, now);
  const dated = tierOne.flatMap((journal) => {
    const latestAt = totals.get(journal.sourceId)?.latestAt;
    return latestAt ? [{ journal, latestAt }] : [];
  });
  const day = dated.map((entry) => beijingDate(entry.latestAt)).sort().at(-1) ?? today;
  const recent = dated.filter((entry) => beijingDate(entry.latestAt) === day).sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
  return homeOf(today, all.total, day, false, recent.map(({ journal }) => ({ journal, total: 0 })), now);
}

/** 列进首页的那几本刊的条目：每本一次 pool 页，其余刊只体现在 omitted 里。 */
async function homeOf(today: string, todayNew: number, day: string, live: boolean, chosen: Array<{ journal: JournalRef; total: number }>, now: Date): Promise<JournalHome> {
  const since = beijingMidnight(day);
  const entries = await Promise.all(chosen.slice(0, HOME_JOURNALS).map(async ({ journal }) => {
    const pool = await loadPool(query({ source: journal.sourceId, since, page: 1 }, now));
    return {
      journal: { ...journal, total: pool.total, latestAt: pool.items[0]?.timelineAt ?? null },
      count: pool.total,
      items: pool.items.slice(0, live ? HOME_ITEMS : HOME_ITEMS - 1),
    };
  }));
  return { today, todayNew, day, live, journals: entries.filter((entry) => entry.items.length > 0), omitted: Math.max(0, chosen.length - HOME_JOURNALS) };
}
