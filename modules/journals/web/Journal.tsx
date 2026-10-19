// 单刊页：一本刊最近公开的论文，按天排；右上角是只订这一本刊的 RSS。
import { Link, redirect, useLoaderData } from "react-router";
import type { JournalPage } from "../types";
import { beijingDate } from "@aihot/contracts/time";
import { cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { monthDay } from "@aihot/web/lib/format";
import { DayList, Pagination } from "@aihot/web/features/feed/DayList";
import { EmptyState } from "@aihot/web/components/ui/Page";
import { Badge } from "@aihot/web/components/ui/Badge";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { IconArrowLeft, IconRss } from "@aihot/web/components/icons";
import type { Screen } from "@aihot/web/components/shell/screens";
import { journalFeedPath, journalPagePath } from "../paths.ts";

export const handle: Screen = { tab: "featured", name: "期刊" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ params, request }: { params: { issn?: string }; request: Request }) {
  const issn = String(params.issn ?? "");
  const page = Math.min(Math.max(Number(new URL(request.url).searchParams.get("page")) || 1, 1), 50);
  const data = await loadOr404<JournalPage>(`/api/journal/${encodeURIComponent(issn)}?page=${page}`, { signal: request.signal });
  // 翻过了最后一页：去最后一页，别停在一个空页上。
  if (data.total > 0 && data.page > data.pageCount) {
    throw redirect(data.pageCount > 1 ? `${journalPagePath(data.journal.issn)}?page=${data.pageCount}` : journalPagePath(data.journal.issn));
  }
  return cachedPage(60, { data });
}

export function meta({ loaderData }: { loaderData?: { data: JournalPage } }) {
  const journal = loaderData?.data.journal;
  if (!journal) return pageMeta({ title: "期刊不存在", path: "/journals", noindex: true });
  return pageMeta({
    title: `${journal.name} 最新论文`,
    description: `${journal.name}（${journal.discipline}，ISSN ${journal.issn}）最近公开的论文：中文摘要、原文链接与站内精读，共 ${journal.total} 篇。`,
    path: journalPagePath(journal.issn),
  });
}

export default function JournalRoute() {
  const { data } = useLoaderData<typeof loader>();
  const { journal, items, page, pageCount } = data;
  const href = (p: number) => (p <= 1 ? journalPagePath(journal.issn) : `${journalPagePath(journal.issn)}?page=${p}`);
  return (
    <div className="pb-6">
      <PhoneBar back={{ to: "/journals", label: "期刊" }} title={journal.name} />
      <Link to="/journals" className="hidden items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        <IconArrowLeft size={14} /> 全部期刊
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5 pt-3 lg:pt-1">
        <div className="min-w-0 max-w-[760px]">
          <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-accent">
            {journal.discipline}
            <Badge tone={journal.tier === "T1" ? "accent" : "neutral"}>{journal.tier === "T1" ? "一区" : journal.tier}</Badge>
          </p>
          <h1 data-page-title="" className="mt-1.5 text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink lg:text-[26px]">
            {journal.name}
          </h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-4">
            <span className="num">ISSN {journal.issn}</span>
            <span>
              共收录 <span className="num font-semibold text-ink-2">{journal.total}</span> 篇
            </span>
            {journal.latestAt && (
              <span>
                最近更新 <span className="num">{monthDay(beijingDate(journal.latestAt))}</span>
              </span>
            )}
          </p>
        </div>
        <a
          href={journalFeedPath(journal.issn)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] text-ink-3 ring-1 ring-inset ring-line-soft transition-colors hover:text-accent"
        >
          <IconRss size={15} /> 订阅这本刊
        </a>
      </header>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState title="这本刊暂时还没有公开的论文">新论文进来后要过一遍分析和精选，然后才会出现在这里。</EmptyState>
        </div>
      ) : (
        <DayList items={items} headerAside={<span className="num whitespace-nowrap">共 {journal.total} 篇</span>} />
      )}
      <Pagination page={page} pageCount={pageCount} href={href} />
    </div>
  );
}
