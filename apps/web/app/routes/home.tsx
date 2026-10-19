import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, itemListLd, listPath, pageMeta, readFilters, siteLd } from "../lib/seo";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { ActiveFilters, CategoryTabs, FeedBar, SearchField } from "../features/feed/Filters";
import { loadParts } from "../site-modules";

export const handle: Screen = { tab: "featured", name: "精选" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

/** The modules' blocks above the timeline (a site with none has an empty list). */
const HOME_PARTS = await loadParts((m) => m.home);

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const filters = readFilters(url.searchParams);
  const upstream = new Headers();
  // The timeline and every module's block in one round: a block that fails is left out, not the page.
  const [data, ...blocks] = await Promise.all([
    loadOr404<TimelineResponse>(listPath("/api/site/timeline", filterParams(filters)), { responseHeaders: upstream, signal: request.signal }),
    ...HOME_PARTS.map(({ part }) => apiGet<unknown>(part.load, { signal: request.signal }).catch(() => null)),
  ]);
  // Older than a day: the reader should know this is not today's news as much as "nothing new today".
  const stale = Date.now() - Date.parse(data.freshness) > 24 * 3600_000;
  return cachedPage(60, { data, filters, stale, home: HOME_PARTS.map(({ name }, i) => ({ name, data: blocks[i] ?? null })) }, upstream);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  const titles = loaderData?.data.cards.map((c) => c.item.title) ?? [];
  return pageMeta({ path, noindex: hasFeedFilters(loaderData?.filters), jsonLd: path === "/" ? [...siteLd(), itemListLd("/", "精选", titles)] : undefined });
}

export default function Home() {
  const { data, filters, stale, home } = useLoaderData<typeof loader>();
  const title = filters.tag ? `#${filters.tag}` : "精选";
  return (
    <div className="pb-6">
      {/* Phones: the bar (精选 | 全部, filter, search), the filter in use, today's hot topics, the feed. */}
      <FeedBar base="/" category={filters.category} channel={filters.channel} />
      <ActiveFilters base="/" category={filters.category} channel={filters.channel} tag={filters.tag} />
      <div className="hidden lg:block">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{title}</h1>
        <div className="mb-5 mt-4 flex items-center justify-between gap-4">
          <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
          <SearchField keep={{ category: filters.category }} />
        </div>
      </div>

      {data.freshness && (
        <p className="px-4 pb-2 text-[12px] text-ink-4 lg:px-0">
          {stale ? "数据可能不是最新，最后更新于 " : "更新于 "}
          <span className="num">{beijingDate(data.freshness)} {beijingTime(data.freshness)}</span>
          {data.latestPublishedAt && (
            <>
              {" · 最新发表于 "}
              <span className="num">{beijingDate(data.latestPublishedAt)}</span>
            </>
          )}
        </p>
      )}

      {data.hot && inNav("/hot") && <HotTopics entries={data.hot} />}

      {HOME_PARTS.map(({ name, part }, i) => {
        const loaded = home.find((block) => block.name === name)?.data ?? null;
        return loaded === null ? null : <part.Block key={name} data={loaded} />;
      })}

      <Timeline initial={data} filters={data.filters} />
    </div>
  );
}
