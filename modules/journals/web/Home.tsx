// 首页时间线上方的「今日顶刊」：今天新上线多少篇，一区期刊各自今天上了什么（今天没有就退到最近一次）。
import { Link } from "react-router";
import { monthDay, readerText } from "@aihot/web/lib/format";
import type { JournalHome } from "../types";

export default function JournalHomeBlock({ data }: { data: unknown }) {
  const home = data as JournalHome | null;
  if (!home) return null;
  return (
    <section aria-label={home.live ? "今日顶刊" : "最近上线的顶刊"} className="mb-4 mt-3 lg:mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] text-ink-3">
          {home.todayNew > 0 ? (
            <>
              今天新上线 <span className="num font-semibold text-ink">{home.todayNew}</span> 篇
            </>
          ) : (
            "今天还没有新论文上线"
          )}
          {!home.live && (
            <>
              {" · "}最近更新 <span className="num">{monthDay(home.day)}</span>
            </>
          )}
          <span className="text-ink-4"> · 看 <Link to="/hot" className="text-accent hover:underline">热度榜</Link></span>
        </p>
        <Link to="/journals" className="text-[13px] text-accent hover:underline">全部期刊</Link>
      </div>

      {home.journals.length > 0 && (
        <div className="card mt-2.5 overflow-hidden">
          <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line-soft px-4 py-2.5">
            <h2 className="text-[16px] font-semibold text-ink">{home.live ? "今日顶刊" : "最近上线的顶刊"}</h2>
            <span className="text-[12px] text-ink-4">{home.live ? "一区期刊今天新上线的论文" : `一区期刊 ${monthDay(home.day)} 上线的新论文`}</span>
          </header>
          <ul className="divide-y divide-line-soft">
            {home.journals.map(({ journal, count, items }) => (
              <li key={journal.issn} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <Link to={`/journal/${journal.issn}`} className="min-w-0 truncate text-[16px] font-semibold text-ink hover:text-accent">
                    {journal.name}
                  </Link>
                  <span className="shrink-0 rounded-full bg-bg-sunk px-2 py-0.5 text-[11.5px] text-ink-3">
                    <span className="num">{count}</span> 篇
                  </span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {items.map((item) => (
                    <li key={item.id} className="line-clamp-1 text-[14px] leading-[1.65]">
                      <Link to={`/items/${item.id}`} className="text-ink-2 hover:text-accent">{readerText(item.title)}</Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {/* 一区期刊有 51 本，首页只放更新最多的几本，其余在期刊目录里。 */}
          {home.omitted > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2.5 text-[12px] text-ink-4">
              <span>
                还有 <span className="num">{home.omitted}</span> 本刊 {home.live ? "今天" : monthDay(home.day)} 也有更新
              </span>
              <Link to="/journals" className="text-accent hover:underline">去期刊目录</Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
