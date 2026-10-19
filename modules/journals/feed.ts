// 按刊订阅（/feed/journal/<ISSN>.xml）：这本刊最近公开的论文，标题、中文摘要，附原文与站内阅读入口。
// 条目和站内其他 RSS 一样从公开读取层来，GUID 用文章 id。
import type { FeedItemSummary } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { config } from "@aihot/backend/config";
import { escapeXml } from "@aihot/backend/lib/text";
import { itemUrl, siteUrl } from "@aihot/backend/publication/links";
import { originalUrls } from "@aihot/backend/publication/items";
import { loadPool } from "@aihot/backend/publication/pool";
import { journalFeedPath, journalPagePath } from "./paths.ts";
import type { JournalRef } from "./types.ts";

/** RSS <author> 要一个地址：站点自己域名上的 no-reply。 */
const AUTHOR = `noreply@${new URL(config.siteUrl).hostname}`;

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")}]]>`;
}

function itemXml(item: FeedItemSummary, original: string | null): string {
  const link = itemUrl(item.id);
  const description = [
    `<p>${escapeXml(item.summary ?? "")}</p>`,
    original ? `<p>🔗 <a href="${escapeXml(original)}">阅读原文</a></p>` : "",
    `<p>via ${escapeXml(item.source.name)} · <a href="${link}">${link}</a></p>`,
  ].filter(Boolean).join("\n");
  const pubDate = item.publishedAt ? `\n      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>` : "";
  return `    <item>
      <title>${cdata(item.title)}</title>
      <link>${link}</link>
      <description>${cdata(description)}</description>${pubDate}
      <guid isPermaLink="false">${escapeXml(item.id)}</guid>
      <author>${escapeXml(AUTHOR)} (${escapeXml(item.source.name)})</author>
    </item>`;
}

/** 一刊的 RSS：最近一页公开论文，最新的在前。 */
export async function journalFeed(journal: JournalRef, now = new Date()): Promise<string> {
  const pool = await loadPool({ channel: "all", category: null, tag: null, source: journal.sourceId, page: 1, now });
  const originals = await originalUrls(pool.items.map((item) => item.id), now);
  const self = journalFeedPath(journal.issn);
  const description = `${journal.name}（${journal.discipline}，ISSN ${journal.issn}）最新公开的论文：中文摘要、原文链接与站内精读。`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${journal.name} — ${SITE.name}`)}</title>
    <link>${escapeXml(siteUrl(journalPagePath(journal.issn)))}</link>
    <description>${escapeXml(description)}</description>
    <language>zh-CN</language>
    <atom:link href="${escapeXml(siteUrl(self))}" rel="self" type="application/rss+xml" />
    <ttl>60</ttl>
    <generator>${escapeXml(`${SITE.name} (${siteUrl("/agent")})`)}</generator>
${pool.items.map((item) => itemXml(item, originals.get(item.id) ?? null)).join("\n")}
  </channel>
</rss>
`;
}
