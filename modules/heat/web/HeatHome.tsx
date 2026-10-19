// 首页时间线上方的两栏：左边「最热」（按热度；没有引用时退到近 7 天增长最快的），右边「最新」（最近入库的公开论文）。
import { Link } from "react-router";
import type { FeedItemSummary } from "@aihot/contracts/site";
import { beijingDate } from "@aihot/contracts/time";
import type { HeatHome as HeatHomeData, PaperHeatEntry } from "../types";
import { readerText } from "@aihot/web/lib/format";
import { SourceTag } from "@aihot/web/components/ui/SourceTag";

const HEAT_NOTE = {
  heat: "按引用速度排",
  growth: "近 7 天被引增长最快（还没有引用的新论文）",
  none: "引用数据还没有积累起来",
} as const;

function Row({ item, meta }: { item: FeedItemSummary; meta: string }) {
  return (
    <li className="px-4 py-2.5">
      <Link to={`/items/${item.id}`} className="line-clamp-2 text-[14.5px] leading-[1.65] text-ink-2 hover:text-accent">
        {readerText(item.title)}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-4">
        <SourceTag name={item.source.name} size="sm" />
        {meta && <span>{meta}</span>}
      </div>
    </li>
  );
}

function heatMeta(entry: PaperHeatEntry): string {
  const growth = entry.growth7 === null ? "" : ` · 近 7 天 +${entry.growth7}`;
  return `被引 ${entry.cites}${growth}`;
}

export default function HeatHomeBlock({ data }: { data: unknown }) {
  const home = data as HeatHomeData | null;
  if (!home) return null;
  return (
    <section aria-label="最热与最新" className="mb-4 mt-3 grid gap-3 lg:mb-5 lg:grid-cols-2 lg:gap-4">
      <div className="card overflow-hidden">
        <header className="flex items-baseline justify-between gap-3 border-b border-line-soft px-4 py-2.5">
          <h2 className="text-[16px] font-semibold text-ink">最热</h2>
          <Link to="/hot/papers" className="text-[12px] text-accent hover:underline">全部热度</Link>
        </header>
        <p className="px-4 pt-2 text-[12px] text-ink-4">{HEAT_NOTE[home.mode]}</p>
        {home.hot.length > 0 ? (
          <ul className="divide-y divide-line-soft pb-1">
            {home.hot.map((entry) => (
              <Row key={entry.item.id} item={entry.item} meta={heatMeta(entry)} />
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-4 pt-2 text-[13px] text-ink-4">暂时没有可排的论文，引用数据每天更新。</p>
        )}
      </div>

      <div className="card overflow-hidden">
        <header className="flex items-baseline justify-between gap-3 border-b border-line-soft px-4 py-2.5">
          <h2 className="text-[16px] font-semibold text-ink">最新</h2>
          <Link to="/all" className="text-[12px] text-accent hover:underline">全部论文</Link>
        </header>
        {home.latest.length > 0 ? (
          <ul className="divide-y divide-line-soft pb-1">
            {home.latest.map((item) => (
              <Row key={item.id} item={item} meta={item.publishedAt ? `发表 ${beijingDate(item.publishedAt)}` : ""} />
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-4 pt-2 text-[13px] text-ink-4">还没有新入库的论文。</p>
        )}
      </div>
    </section>
  );
}
