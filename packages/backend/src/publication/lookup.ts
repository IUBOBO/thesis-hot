// Finds the public report whose original link carries an identifier (a DOI or an arXiv number).
// Search text does not hold links, so identifiers are matched on the listed report's URL.
import { sql } from "../db.ts";
import { listedCondition } from "./scope.ts";

export const IDENTIFIER_PATTERNS = [
  /^10\.\d{4,9}\/\S+$/,
  /^(?:arxiv:)?\d{4}\.\d{4,5}(?:v\d+)?$/i,
];

/** Trimmed input as an identifier, or null when it is only ordinary search words. */
export function identifierOf(term: string): string | null {
  const t = term.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  return IDENTIFIER_PATTERNS.some((p) => p.test(t)) ? t.replace(/^arxiv:/i, "") : null;
}

/** The id of the listed report that links this identifier, or null. */
export async function findItemByIdentifier(identifier: string, now: Date = new Date()): Promise<string | null> {
  const needle = identifier.replace(/[\\%_]/g, (c) => `\\${c}`).toLowerCase();
  const rows = await sql<{ article_id: string }[]>`
    SELECT p.article_id FROM publications p
    WHERE ${listedCondition(now)} AND lower(p.url) LIKE ${`%${needle}%`}
    ORDER BY p.sort_at DESC LIMIT 1`;
  return rows[0]?.article_id ?? null;
}
