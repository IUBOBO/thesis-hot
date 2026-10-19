// 榜单与接口共用的形状。
import type { FeedItemSummary } from "@aihot/contracts/site";

/** 榜单上的一篇论文。 */
export interface PaperHeatEntry {
  rank: number;
  item: FeedItemSummary;
  /** 热度指数（见 heat.ts）：三个速度按 5:3:2 加权，没有来源的项不计入。 */
  heat: number;
  /** 引用总数（OpenAlex 上一次采集的值）。 */
  cites: number;
  /** 近 7 天新增的引用；还没有一周前的记录时为 null。 */
  growth7: number | null;
  /** 讨论数；没有采集来源时是 0。 */
  discussions: number;
  /** 代码 star 数；没有采集来源时是 0。 */
  stars: number;
  /** 上线天数（至少 1），热度按它归一。 */
  ageDays: number;
  /** 原文发布时间；不知道时用站内时间。 */
  publishedAt: string | null;
}

/** GET /api/heat/home：首页两栏，左边最热，右边最新。 */
export interface HeatHome {
  /** heat：按热度；growth：近 7 天被引增长（还没有引用的新论文）；none：两者都没有。 */
  mode: "heat" | "growth" | "none";
  hot: PaperHeatEntry[];
  latest: FeedItemSummary[];
}

/** GET /api/heat/papers。 */
export interface PaperHeatResponse {
  /** 这份榜的时间。 */
  computedAt: string;
  /** 只收上线这么多天以内的论文。 */
  windowDays: number;
  /** 有引用信号的篇数（榜单里还有热度为 0 的新论文）。 */
  citedCount: number;
  entries: PaperHeatEntry[];
}

/** GET /api/heat/item/:id：一篇公开论文最近一次采集到的引用数。 */
export interface PaperSignal {
  cites: number;
  /** 采集的那一天（北京时间，YYYY-MM-DD）。 */
  day: string;
  capturedAt: string;
}
