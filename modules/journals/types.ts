// 期刊页、按刊 RSS 与首页「今日顶刊」共用的数据形状（接口与网页都读这一份）。
import type { FeedItemSummary, PoolResponse } from "@aihot/contracts/site";

/** industry/journals.json 里的一本刊：它的论文挂在 sourceId 这个信源下。 */
export interface JournalRef {
  issn: string;
  name: string;
  discipline: string;
  tier: string;
  sourceId: string;
}

/** 一本刊及其已公开的论文数、最近一篇的时间。 */
export interface JournalEntry extends JournalRef {
  total: number;
  /** 最近一篇的站内时间；一篇都没有时为 null。 */
  latestAt: string | null;
}

/** GET /api/journal：期刊目录，按 journals.json 的顺序。 */
export interface JournalsIndex {
  journals: JournalEntry[];
}

/** GET /api/journal/:issn：单刊的一页论文，字段与全部动态的一页相同。 */
export interface JournalPage extends PoolResponse {
  journal: JournalEntry;
}

/** 首页「今日顶刊」里的一本刊：有更新的一篇到几篇，同一天新旧一览。 */
export interface JournalToday {
  journal: JournalEntry;
  /** 这一天这本刊上线了几篇；列表里只放前几篇。 */
  count: number;
  items: FeedItemSummary[];
}

/** GET /api/journal/home：今天新上线的篇数，以及一区期刊今天的（或最近一次的）更新。 */
export interface JournalHome {
  /** 北京时间的今天（YYYY-MM-DD）。 */
  today: string;
  /** 今天新上线的论文数（所有信源，不只是期刊）。 */
  todayNew: number;
  /** journals 是哪一天的：今天有更新就是今天，否则是最近一次有更新的那天。 */
  day: string;
  /** journals 里的条目是不是今天的。 */
  live: boolean;
  /** 有更新的那一批一区期刊：首页只放前几本，按这一天的篇数排。 */
  journals: JournalToday[];
  /** 这一天也有更新、但没列进 journals 的刊数（去期刊目录看）。 */
  omitted: number;
}
