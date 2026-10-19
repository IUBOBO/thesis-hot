// 保存的搜索的 RSS：和站内搜索同一套筛选，按发布时间倒序，最多 50 条。
// 地址里的 token 就是权限；token 不对返回 null。
import { SITE } from "@aihot/site";
import { escapeXml } from "@aihot/backend/lib/text";
import { itemUrl, siteUrl } from "@aihot/backend/publication/links";
import { loadPool } from "@aihot/backend/publication/pool";
import { searchByToken, type SavedSearch } from "./searches.ts";

function rfc822(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

/** 站内 /all 的地址，带上这条搜索的条件。 */
export function searchPageUrl(search: SavedSearch): string {
  const params = new URLSearchParams();
  if (search.query) params.set("q", search.query);
  if (search.filters.channel !== "all") params.set("channel", search.filters.channel);
  if (search.filters.category) params.set("category", search.filters.category);
  if (search.filters.tag) params.set("tag", search.filters.tag);
  if (search.filters.kind) params.set("kind", search.filters.kind);
  if (search.filters.oa !== null) params.set("oa", search.filters.oa ? "1" : "0");
  if (search.filters.within) params.set("within", String(search.filters.within));
  const query = params.toString();
  return siteUrl(`/all${query ? `?${query}` : ""}`);
}

export async function savedSearchFeed(token: string): Promise<string | null> {
  const search = await searchByToken(token);
  if (!search) return null;
  const pool = await loadPool({
    q: search.query || null,
    ...search.filters,
    page: 1,
    now: new Date(),
  });
  const items = pool.items.map((item) => {
    const parts = [
      `<title>${escapeXml(item.title)}</title>`,
      `<link>${escapeXml(itemUrl(item.id))}</link>`,
      `<guid isPermaLink="false">${escapeXml(item.id)}</guid>`,
      `<pubDate>${rfc822(item.publishedAt ?? item.timelineAt)}</pubDate>`,
      item.summary ? `<description>${escapeXml(item.summary)}</description>` : "",
      item.source?.name ? `<source>${escapeXml(item.source.name)}</source>` : "",
    ];
    return `<item>${parts.join("")}</item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escapeXml(`${SITE.name} · ${search.name}`)}</title>
<link>${escapeXml(searchPageUrl(search))}</link>
<description>${escapeXml(`${SITE.name} 保存的搜索：${search.query || "全部内容"}`)}</description>
<language>zh-CN</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<atom:link href="${escapeXml(search.feedUrl)}" rel="self" type="application/rss+xml"/>
${items.join("\n")}
</channel>
</rss>`;
}
