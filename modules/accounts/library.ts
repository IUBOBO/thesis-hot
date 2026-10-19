// 账号的文献库：收藏（带卡片快照）和已读记录。接口只认编号和有限的文本长度。
import { sql } from "@aihot/backend/db";
import type { AccountMe } from "./types.ts";

const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const STARRED_LIMIT = 500;
const READ_LIMIT = 5000;

export type StarStatus = "saved" | "reading" | "done";

export interface LibraryStar {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string;
  savedAt: string;
  publishedAt: string | null;
  score: number | null;
  aiSelected: boolean;
  /** A reader's own folder name; null when the star is not grouped. */
  folder: string | null;
  /** A reader's own tags, at most five short words. */
  tags: string[];
  /** Where the reader is with it: saved (to read), reading, done. */
  status: StarStatus;
}

export interface Library {
  stars: LibraryStar[];
  reads: string[];
}

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const date = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
};

/** 把客户端发来的收藏卡片收成能入库的一行；编号不对就 null。 */
export function readStar(value: unknown): LibraryStar | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = clean(raw.id, 80);
  const title = clean(raw.title, 500);
  if (!ID.test(id) || !title) return null;
  return {
    id,
    title,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 4000) : null,
    sourceName: clean(raw.sourceName, 200),
    savedAt: date(raw.savedAt) ?? new Date().toISOString(),
    publishedAt: date(raw.publishedAt),
    score: typeof raw.score === "number" && Number.isFinite(raw.score) ? Math.round(raw.score) : null,
    aiSelected: raw.aiSelected === true,
    folder: clean(raw.folder, 40).trim() || null,
    tags: readTags(raw.tags),
    status: readStatus(raw.status),
  };
}

/** A reading status the app knows; anything else is a star to read. */
export function readStatus(value: unknown): StarStatus {
  return value === "reading" || value === "done" ? value : "saved";
}

/** Tags as a short, de-duplicated list of words; anything longer is cut. */
export function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string").map((v) => v.trim().slice(0, 20)).filter(Boolean))].slice(0, 5);
}

export function readIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && ID.test(v)))].slice(0, READ_LIMIT);
}

/** 这个账号的全部文献库；收藏按保存时间、已读按最近读的在前。 */
export async function listLibrary(account: AccountMe): Promise<Library> {
  const [stars, reads] = await Promise.all([
    sql<{ article_id: string; title: string; summary: string | null; source_name: string; saved_at: Date; published_at: Date | null; score: number | null; ai_selected: boolean; folder: string | null; tags: string[]; status: string }[]>`
      SELECT article_id, title, summary, source_name, saved_at, published_at, score, ai_selected, folder, tags, status
      FROM account_stars WHERE account_id = ${account.id} ORDER BY saved_at DESC LIMIT ${STARRED_LIMIT}`,
    sql<{ article_id: string }[]>`
      SELECT article_id FROM account_reads WHERE account_id = ${account.id} ORDER BY read_at DESC LIMIT ${READ_LIMIT}`,
  ]);
  return {
    stars: stars.map((row) => ({
      id: row.article_id,
      title: row.title,
      summary: row.summary,
      sourceName: row.source_name,
      savedAt: row.saved_at.toISOString(),
      publishedAt: row.published_at?.toISOString() ?? null,
      score: row.score,
      aiSelected: row.ai_selected,
      folder: row.folder,
      tags: row.tags ?? [],
      status: readStatus(row.status),
    })),
    reads: reads.map((row) => row.article_id),
  };
}

/** 登录后把浏览器里的收藏和已读并进来；已有的不覆盖。 */
export async function mergeLibrary(account: AccountMe, stars: LibraryStar[], reads: string[]): Promise<void> {
  const rows = stars.slice(0, STARRED_LIMIT).map((star) => ({
    account_id: account.id,
    article_id: star.id,
    title: star.title,
    summary: star.summary,
    source_name: star.sourceName,
    saved_at: new Date(star.savedAt),
    published_at: star.publishedAt ? new Date(star.publishedAt) : null,
    score: star.score,
    ai_selected: star.aiSelected,
    folder: star.folder,
    tags: star.tags,
    status: star.status,
  }));
  if (rows.length) {
    await sql`INSERT INTO account_stars ${sql(rows)} ON CONFLICT (account_id, article_id) DO NOTHING`;
  }
  if (reads.length) {
    await sql`INSERT INTO account_reads ${sql(reads.map((id) => ({ account_id: account.id, article_id: id })))}
      ON CONFLICT (account_id, article_id) DO NOTHING`;
  }
}

/** 收藏或取消一篇；取消只删这一条。 */
export async function setStar(account: AccountMe, star: LibraryStar, on: boolean): Promise<void> {
  if (!on) {
    await unsetStar(account, star.id);
    return;
  }
  await sql`INSERT INTO account_stars (account_id, article_id, title, summary, source_name, saved_at, published_at, score, ai_selected, folder, tags, status)
    VALUES (${account.id}, ${star.id}, ${star.title}, ${star.summary}, ${star.sourceName}, ${new Date(star.savedAt)}, ${star.publishedAt ? new Date(star.publishedAt) : null}, ${star.score}, ${star.aiSelected}, ${star.folder}, ${star.tags}, ${star.status})
    ON CONFLICT (account_id, article_id) DO UPDATE SET saved_at = EXCLUDED.saved_at`;
}

/** 取消收藏；只认编号，客户端不必再发一份卡片。 */
export async function unsetStar(account: AccountMe, id: string): Promise<void> {
  if (!ID.test(id)) return;
  await sql`DELETE FROM account_stars WHERE account_id = ${account.id} AND article_id = ${id}`;
}

/** 记已读；重复读同一篇只把时间挪到最前。 */
export async function markRead(account: AccountMe, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await sql`INSERT INTO account_reads ${sql(ids.map((id) => ({ account_id: account.id, article_id: id })))}
    ON CONFLICT (account_id, article_id) DO UPDATE SET read_at = now()`;
}

const NOTE_LIMIT = 20_000;

/** 这篇的笔记；没有就是 null。 */
export async function getNote(account: AccountMe, id: string): Promise<string | null> {
  if (!ID.test(id)) return null;
  const [row] = await sql<{ body: string }[]>`
    SELECT body FROM account_notes WHERE account_id = ${account.id} AND article_id = ${id}`;
  return row?.body ?? null;
}

/** 保存笔记；空字符串等于删除。 */
export async function saveNote(account: AccountMe, id: string, body: string): Promise<void> {
  if (!ID.test(id)) return;
  const text = body.slice(0, NOTE_LIMIT);
  if (!text.trim()) {
    await sql`DELETE FROM account_notes WHERE account_id = ${account.id} AND article_id = ${id}`;
    return;
  }
  await sql`INSERT INTO account_notes (account_id, article_id, body) VALUES (${account.id}, ${id}, ${text})
    ON CONFLICT (account_id, article_id) DO UPDATE SET body = EXCLUDED.body, updated_at = now()`;
}

/** 改一条收藏的分组和标签；收藏不存在时什么也不做。 */
export async function setStarMeta(account: AccountMe, id: string, folder: string | null, tags: string[], status: StarStatus): Promise<void> {
  if (!ID.test(id)) return;
  await sql`UPDATE account_stars SET folder = ${folder}, tags = ${tags}, status = ${status}
    WHERE account_id = ${account.id} AND article_id = ${id}`;
}
