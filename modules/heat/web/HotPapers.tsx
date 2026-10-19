// 论文热度榜：最近 30 天上线的论文，按引用速度排；点开是这篇的中文精读。
import { Fragment } from "react";
import { Link, useLoaderData } from "react-router";
import type { PaperHeatEntry, PaperHeatResponse } from "../types";
import { beijingDate } from "@aihot/contracts/time";
import { cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { monthDay, monthDayTime } from "@aihot/web/lib/format";
import { EmptyState } from "@aihot/web/components/ui/Page";
import { SourceTag } from "@aihot/web/components/ui/SourceTag";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { IconChevronDown, IconInfo } from "@aihot/web/components/icons";
import type { Screen } from "@aihot/web/components/shell/screens";
import { readerText } from "@aihot/web/lib/format";
import { flameColor } from "@aihot/web/lib/flame";

export const handle: Screen = { tab: "hot", name: "热度" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  return cachedPage(300, { heat: await loadOr404<PaperHeatResponse>("/api/heat/papers", { signal: request.signal }) });
}

export function meta() {
  return pageMeta({
    title: "论文热度",
    description: "最近 30 天上线的论文按引用速度排名：引用数来自 OpenAlex，每天更新；讨论按站内报道它的其他信源数计算；代码信号暂无公开来源，不计入。",
    path: "/hot/papers",
  });
}

const pad = (rank: number) => String(rank).padStart(2, "0");
const rankColor = (rank: number) => (rank === 1 ? "text-rank-1" : rank === 2 ? "text-rank-2" : rank === 3 ? "text-rank-3" : "text-rank-rest");

/** 一行：名次、标题与来源、热度、引用（宽屏右侧）。整行点进这篇的精读。 */
function Row({ entry }: { entry: PaperHeatEntry }) {
  return (
    <li className="group relative grid grid-cols-[30px_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3.5 transition-colors hover:bg-bg-sunk/70 sm:px-5 lg:grid-cols-[44px_minmax(0,1fr)_112px_104px] lg:items-center lg:gap-x-6 lg:px-6">
      <span className="mono text-[16px] font-semibold leading-[24px] lg:text-[17px]" style={{ color: flameColor(entry.rank) }} aria-label={`热度排名第 ${entry.rank} 位`}>
        {pad(entry.rank)}
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-[650] leading-[1.55] text-ink">
          <Link to={`/items/${entry.item.id}`} className="transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-accent">
            {readerText(entry.item.title)}
          </Link>
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-4">
          <SourceTag name={entry.item.source.name} size="sm" />
          {entry.publishedAt && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-amber-ink">上线 <span className="num">{monthDay(beijingDate(entry.publishedAt))}</span></span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span><span className="num">{entry.ageDays}</span> 天</span>
          {/* 宽屏这一栏在右侧，手机上并在这里。 */}
          {entry.cites > 0 && (
            <span className="lg:hidden">
              <span aria-hidden="true">· </span>引用 <span className="num">{entry.cites}</span>
            </span>
          )}
          {entry.cites === 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>还没有引用</span>
            </>
          )}
        </p>
      </div>
      <div className="hidden text-right lg:block">
        <div className="text-[12px] text-ink-4">
          引用 <span className="num font-semibold text-ink-2">{entry.cites}</span>
        </div>
        {entry.growth7 !== null && (
          <div className={`mt-0.5 text-[12px] ${entry.growth7 > 0 ? "text-hot" : "text-ink-4"}`}>
            近 7 天 <span className="num">{entry.growth7 > 0 ? "+" : ""}{entry.growth7}</span>
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="mono text-[20px] font-semibold leading-none tracking-[-0.02em]" style={{ color: flameColor(entry.rank) }}>{entry.heat.toFixed(1)}</div>
        <div className="mt-1 text-[11.5px] text-ink-4">热度</div>
      </div>
    </li>
  );
}

export default function HotPapersPage() {
  const { heat } = useLoaderData<typeof loader>();
  return (
    <div className="pb-10">
      <PhoneBar
        title="热度"
        large
        sub={<>最近 {heat.windowDays} 天上线 · 按引用速度排 · <span className="num">{heat.entries.length}</span> 篇</>}
      />
      <header className="hidden flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5 pt-1 lg:flex">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-hot">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-hot opacity-30" />
              <span className="relative inline-flex size-2 rounded-full bg-hot" />
            </span>
            论文热度
          </div>
          <h1 data-page-title="" className="mt-1.5 text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink lg:text-[26px]">论文热度榜</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">
            最近 {heat.windowDays} 天上线的 {heat.entries.length} 篇论文，按引用速度排
            {heat.citedCount > 0 && <>，其中 <span className="num">{heat.citedCount}</span> 篇已有引用</>}
          </p>
        </div>
        <p className="text-[12px] text-ink-4">
          <span className="num">{monthDayTime(heat.computedAt)}</span> 更新 · 引用来自 OpenAlex
        </p>
      </header>

      {heat.entries.length === 0 ? (
        <div className="card rounded-sheet">
          <EmptyState title="最近还没有上线的论文">新论文进来后要过一遍分析和精选，然后才会进榜。</EmptyState>
        </div>
      ) : (
        <ol className="card divide-y divide-line-soft overflow-hidden">
          {heat.entries.map((entry, index) => (
            <Fragment key={entry.item.id}>
              {/* 有引用的排在前，后面是刚上线、还没有引用的：分开说清楚，别让 0.0 看起来像算错了。 */}
              {entry.cites === 0 && (index === 0 || heat.entries[index - 1]!.cites > 0) && (
                <li className="bg-bg-sunk/70 px-4 py-3 sm:px-5 lg:px-6">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="h-px flex-1 bg-line-strong" />
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[11.5px] font-semibold text-ink-3 ring-1 ring-inset ring-line">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-4" />
                      还没有引用的新论文
                    </span>
                    <span aria-hidden="true" className="h-px flex-1 bg-line-strong" />
                  </div>
                  <p className="mt-1.5 text-center text-[11.5px] leading-relaxed text-ink-4">
                    按上线时间排，引用涨起来后会往上前移
                  </p>
                </li>
              )}
              <Row entry={entry} />
            </Fragment>
          ))}
        </ol>
      )}

      <details id="paper-heat-method" className="disclosure group/method mt-8 scroll-mt-[calc(var(--bar-h)+16px)] text-[12px] text-ink-4">
        <summary className="flex items-center gap-1.5 py-1 transition-colors hover:text-ink-2">
          <IconInfo size={15} />
          热度是怎么算的？
          <span className="ml-auto inline-flex items-center gap-0.5">
            <span className="group-open/method:hidden">了解榜单</span>
            <span className="hidden group-open/method:inline">收起</span>
            <IconChevronDown size={13} className="transition-transform duration-200 group-open/method:rotate-180" />
          </span>
        </summary>
        <div className="max-w-[760px] space-y-2 pb-2 pl-[21px] pt-2 leading-[1.75] text-ink-3">
          <p>热度来自三个信号：引用、讨论、代码。每项先算「平均每天涨多少」（总数 ÷ 上线天数），再按 5:3:2 加权，乘 100 显示。</p>
          <p>引用数从 OpenAlex 每天拉一次，一条引用曲线只有累积，所以榜单看的是这篇论文从上线到现在每天被引用的速度，不是最近一天的暴涨。</p>
          <p>讨论按站内报道同一事件的其他信源数计算（自己不算），单独报道的记为 0；代码还没有免费的公开来源，暂时不计入，接上以后不用改算法，只补数据。</p>
          <p>榜单只收最近 {heat.windowDays} 天上线的论文，取前 30 篇；刚上线、还没有引用的新论文排在后面。点开一篇可以看它的中文精读与原文。</p>
        </div>
      </details>
    </div>
  );
}
