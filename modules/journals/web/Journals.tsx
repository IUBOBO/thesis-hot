// 期刊目录：站里跟的每一本刊，按学科分组。点进去是单刊页，右边的 RSS 是只订这一本刊的地址。
import { Link, useLoaderData } from "react-router";
import type { JournalsIndex } from "../types";
import { cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { monthDay } from "@aihot/web/lib/format";
import { beijingDate } from "@aihot/contracts/time";
import { SITE } from "@aihot/site";
import { Badge } from "@aihot/web/components/ui/Badge";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import { IconRss } from "@aihot/web/components/icons";
import type { Screen } from "@aihot/web/components/shell/screens";
import { journalFeedPath } from "../paths.ts";

export const handle: Screen = { tab: "featured", name: "期刊" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const data = await loadOr404<JournalsIndex>("/api/journal", { signal: request.signal });
  return cachedPage(300, { data });
}

export function meta({ loaderData }: { loaderData?: { data: JournalsIndex } }) {
  const count = loaderData?.data.journals.length ?? 10;
  return pageMeta({
    title: "期刊",
    description: `${SITE.name} 关注的 ${count} 本期刊：每本刊一页，最近公开的论文、更新时间与只订这一本的 RSS。`,
    path: "/journals",
  });
}

/** 按学科分组，组的顺序是清单里的顺序。 */
function byDiscipline(journals: JournalsIndex["journals"]): Array<{ discipline: string; journals: JournalsIndex["journals"] }> {
  const groups: Array<{ discipline: string; journals: JournalsIndex["journals"] }> = [];
  for (const journal of journals) {
    const group = groups.find((g) => g.discipline === journal.discipline);
    if (group) group.journals.push(journal);
    else groups.push({ discipline: journal.discipline, journals: [journal] });
  }
  return groups;
}

export default function JournalsPage() {
  const { data } = useLoaderData<typeof loader>();
  const groups = byDiscipline(data.journals);
  return (
    <div className="pb-10">
      <PhoneBar title="期刊" large sub={<>站里跟的 {data.journals.length} 本刊，按学科排</>} />
      <header className="hidden pb-5 pt-1 lg:block">
        <h1 data-page-title="" className="text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink">期刊</h1>
        <p className="mt-1.5 max-w-[760px] text-[13.5px] leading-relaxed text-ink-3">
          站里跟的 {data.journals.length} 本刊。点开一本刊看它最近公开的论文；只要这一本，用它的 RSS 订阅。
        </p>
      </header>

      {groups.map(({ discipline, journals }) => (
        <section key={discipline} className="mb-6" aria-label={discipline}>
          <h2 className="px-1 text-[13px] font-semibold tracking-[0.04em] text-ink-3">{discipline}</h2>
          <ul className="card mt-2 divide-y divide-line-soft overflow-hidden">
            {journals.map((journal) => (
              <li key={journal.issn} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/journal/${journal.issn}`} className="block truncate text-[15px] font-[650] text-ink transition-colors hover:text-accent">
                    {journal.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-4">
                    <span className="num">{journal.issn}</span>
                    <span aria-hidden="true">·</span>
                    <span><span className="num">{journal.total}</span> 篇</span>
                    {journal.latestAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>最近 <span className="num">{monthDay(beijingDate(journal.latestAt))}</span></span>
                      </>
                    )}
                  </p>
                </div>
                <Badge tone={journal.tier === "T1" ? "accent" : "neutral"}>{journal.tier === "T1" ? "一区" : journal.tier}</Badge>
                <a
                  href={journalFeedPath(journal.issn)}
                  title={`订阅 ${journal.name} 的 RSS`}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] text-ink-3 ring-1 ring-inset ring-line-soft transition-colors hover:text-accent"
                >
                  <IconRss size={14} /> RSS
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
