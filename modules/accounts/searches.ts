// 保存的搜索：账号下的一条检索条件，带一个不可猜的 token 供 RSS 订阅。
// 与收藏一样只属于本人；feed 的地址就是 token，知道链接的人能订阅，所以页面会提醒不要外传。
import { isCategoryKey, isChannelKey, type CategoryKey, type ChannelKey } from "@aihot/contracts/taxonomy";
import { config } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { newArticleId, newShortId } from "@aihot/backend/lib/ids";
import type { AccountMe } from "./types.ts";

export interface SearchFilters {
  channel: ChannelKey;
  category: CategoryKey | null;
  tag: string | null;
  kind: "paper" | "preprint" | null;
  oa: boolean | null;
  within: number | null;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilters;
  feedUrl: string;
  createdAt: string;
}

const DEFAULT_FILTERS: SearchFilters = { channel: "all", category: null, tag: null, kind: null, oa: null, within: null };

/** 把页面传来的筛选收成已知的字段；不认识的落回默认值。 */
export function readSearchFilters(value: unknown): SearchFilters {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const channel = typeof raw.channel === "string" && isChannelKey(raw.channel) ? raw.channel : "all";
  const category = typeof raw.category === "string" && isCategoryKey(raw.category) ? raw.category : null;
  const tag = typeof raw.tag === "string" ? raw.tag.trim().slice(0, 60) || null : null;
  const kind = raw.kind === "paper" || raw.kind === "preprint" ? raw.kind : null;
  const oa = typeof raw.oa === "boolean" ? raw.oa : null;
  const within = raw.within === 7 || raw.within === 30 || raw.within === 365 ? raw.within : null;
  return { channel, category, tag, kind, oa, within };
}

export function searchFeedUrl(token: string): string {
  return `${config.siteUrl.replace(/\/$/, "")}/feed/search/${token}.xml`;
}

const rowToSearch = (row: {
  id: string; name: string; query: string; filters: unknown; feed_token: string; created_at: Date;
}): SavedSearch => ({
  id: row.id,
  name: row.name,
  query: row.query,
  filters: readSearchFilters(row.filters),
  feedUrl: searchFeedUrl(row.feed_token),
  createdAt: row.created_at.toISOString(),
});

/** 这个账号保存的搜索，新的在前。 */
export async function listSearches(account: AccountMe): Promise<SavedSearch[]> {
  const rows = await sql<{ id: string; name: string; query: string; filters: unknown; feed_token: string; created_at: Date }[]>`
    SELECT id, name, query, filters, feed_token, created_at
    FROM account_searches WHERE account_id = ${account.id} ORDER BY created_at DESC LIMIT 50`;
  return rows.map(rowToSearch);
}

/** 保存一条搜索；名称和检索词都截到安全的长度。 */
export async function createSearch(account: AccountMe, input: { name?: unknown; query?: unknown; filters?: unknown }): Promise<SavedSearch> {
  const name = (typeof input.name === "string" ? input.name.trim() : "").slice(0, 40) || "未命名订阅";
  const query = (typeof input.query === "string" ? input.query.trim() : "").slice(0, 200);
  const filters = readSearchFilters(input.filters);
  const id = newArticleId();
  const token = newShortId(24);
  const [row] = await sql<{ id: string; name: string; query: string; filters: unknown; feed_token: string; created_at: Date }[]>`
    INSERT INTO account_searches (id, account_id, name, query, filters, feed_token)
    VALUES (${id}, ${account.id}, ${name}, ${query}, ${sql.json(filters as never)}, ${token})
    RETURNING id, name, query, filters, feed_token, created_at`;
  return rowToSearch(row!);
}

/** 改一条订阅的名字；空名字落回“未命名订阅”。 */
export async function renameSearch(account: AccountMe, id: string, name: unknown): Promise<void> {
  const clean = (typeof name === "string" ? name.trim() : "").slice(0, 40) || "未命名订阅";
  await sql`UPDATE account_searches SET name = ${clean} WHERE account_id = ${account.id} AND id = ${id}`;
}

export async function deleteSearch(account: AccountMe, id: string): Promise<void> {
  await sql`DELETE FROM account_searches WHERE account_id = ${account.id} AND id = ${id}`;
}

/** 按 feed token 找一条保存的搜索；不存在或 token 不对就是 null。 */
export async function searchByToken(token: string): Promise<SavedSearch | null> {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return null;
  const [row] = await sql<{ id: string; name: string; query: string; filters: unknown; feed_token: string; created_at: Date }[]>`
    SELECT id, name, query, filters, feed_token, created_at FROM account_searches WHERE feed_token = ${token}`;
  return row ? rowToSearch(row) : null;
}

export { DEFAULT_FILTERS };
