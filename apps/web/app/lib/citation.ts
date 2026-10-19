import { beijingDate } from "@aihot/contracts/time";

/** The fields a reference needs, all taken from the item detail. */
export interface CitationInput {
  id: string;
  title: string;
  originalTitle: string | null;
  author: string | null;
  publishedAt: string | null;
  source: { name: string };
  links: { original: string };
  /** The publisher's record, when the import kept it. */
  volume?: string | null;
  issue?: string | null;
}

/** The DOI in a publisher link (https://doi.org/10.xxxx/...), or null. */
export function doiOf(url: string): string | null {
  const m = /doi\.org\/(10\.\S+)/i.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!).replace(/[)\].,;]+$/, "");
  } catch {
    return m[1]!;
  }
}

function isArxiv(item: CitationInput): boolean {
  return /\/\/(www\.)?arxiv\.org\//i.test(item.links.original);
}

function authorsOf(item: CitationInput): string[] {
  if (!item.author) return [];
  return item.author
    .split(/\s*(?:,|;|，|；|\band\b)\s*/i)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** The title the reference uses: the original (English) title when there is one, else the Chinese title. */
function titleOf(item: CitationInput): string {
  return (item.originalTitle || item.title).replace(/\s+/g, " ").trim();
}

const BIBTEX_SPECIAL: Record<string, string> = { "&": "\\&", "%": "\\%", "#": "\\#", "_": "\\_", "$": "\\$" };

function bibEscape(text: string): string {
  return text.replace(/[&%#_$]/g, (c) => BIBTEX_SPECIAL[c]!);
}

/** A BibTeX entry: @article for journal papers, @misc for arXiv preprints. */
export function citationBibtex(item: CitationInput): string {
  const doi = doiOf(item.links.original);
  const year = item.publishedAt ? beijingDate(item.publishedAt).slice(0, 4) : "";
  const arxiv = isArxiv(item);
  const key = (authorsOf(item)[0]?.split(/\s+/).pop() ?? "item").replace(/[^A-Za-z0-9]/g, "") + year + item.id.slice(0, 6);
  const fields: Array<[string, string | null]> = [
    ["author", authorsOf(item).length ? authorsOf(item).map(bibEscape).join(" and ") : null],
    ["title", bibEscape(titleOf(item))],
    [arxiv ? "howpublished" : "journal", arxiv ? "arXiv" : bibEscape(item.source.name)],
    ...(arxiv ? [] : ([["volume", item.volume ?? null], ["number", item.issue ?? null]] as Array<[string, string | null]>)),
    ["year", year || null],
    ["doi", doi],
    ["url", doi ? null : item.links.original],
  ];
  const body = fields
    .filter((f): f is [string, string] => f[1] !== null)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(",\n");
  return `@${arxiv ? "misc" : "article"}{${key},\n${body}\n}`;
}

/** An RIS record, the format Zotero, EndNote and Mendeley import. */
export function citationRis(item: CitationInput): string {
  const doi = doiOf(item.links.original);
  const lines = [
    `TY  - ${isArxiv(item) ? "GEN" : "JOUR"}`,
    ...authorsOf(item).map((a) => `AU  - ${a}`),
    `TI  - ${titleOf(item)}`,
    ...(isArxiv(item) ? [] : [`JO  - ${item.source.name}`]),
    ...(isArxiv(item) || !item.volume ? [] : [`VO  - ${item.volume}`]),
    ...(isArxiv(item) || !item.issue ? [] : [`IS  - ${item.issue}`]),
    ...(item.publishedAt ? [`PY  - ${beijingDate(item.publishedAt).replace(/-/g, "/")}`] : []),
    ...(doi ? [`DO  - ${doi}`] : []),
    `UR  - ${item.links.original}`,
    "ER  - ",
  ];
  return lines.join("\n");
}

/** "Reichenbäck, S.": the family name first, the given names as initials (APA). */
function apaName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  const family = parts.at(-1)!;
  const initials = parts.slice(0, -1).map((part) => `${part[0]!.toUpperCase()}.`).join(" ");
  return `${family}, ${initials}`;
}

/** "REICHENBÄCK S": the family name in capitals, the given names as initials (GB/T 7714). */
function gbtName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim().toUpperCase();
  const family = parts.at(-1)!.toUpperCase();
  const initials = parts.slice(0, -1).map((part) => part[0]!.toUpperCase()).join(" ");
  return `${family} ${initials}`;
}

/** The year a reference carries: the paper's publication date in Beijing time, or nothing. */
function yearOf(item: CitationInput): string {
  return item.publishedAt ? beijingDate(item.publishedAt).slice(0, 4) : "";
}

/** The arXiv identifier of an arXiv link ("2610.01234"), for the formats that name it. */
function arxivId(item: CitationInput): string | null {
  return /\/abs\/([^/?#]+)/i.exec(item.links.original)?.[1] ?? null;
}

/** An author list in APA order: "A, B, & C"; one author alone has no ampersand. */
function apaAuthors(item: CitationInput): string {
  const names = authorsOf(item).map(apaName);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")}, & ${names.at(-1)}`;
}

/**
 * APA 7th: author. (year). title. journal, volume(issue). https://doi.org/…
 * An arXiv preprint names the archive instead of a journal.
 */
export function citationApa(item: CitationInput): string {
  const authors = apaAuthors(item);
  const year = yearOf(item);
  const title = `${titleOf(item).replace(/[.?!]$/, "")}.`;
  const doi = doiOf(item.links.original);
  const parts = [authors ? `${authors}` : null, year ? `(${year}).` : "(n.d.).", title];
  if (isArxiv(item)) {
    const id = arxivId(item);
    parts.push(id ? `arXiv:${id}.` : "arXiv.", item.links.original);
  } else {
    parts.push(`${item.source.name}${item.volume ? `, ${item.volume}` : ""}${item.issue ? `(${item.issue})` : ""}.`);
    parts.push(doi ? `https://doi.org/${doi}` : item.links.original);
  }
  return parts.filter(Boolean).join(" ");
}

/**
 * GB/T 7714-2015: 作者. 题名[J]. 刊名, 年, 卷(期). DOI:…
 * Three authors are named, more end with 等 (Chinese names) or et al.
 */
export function citationGbt(item: CitationInput): string {
  const names = authorsOf(item).map(gbtName);
  const chinese = names.some((name) => /[\u4e00-\u9fff]/.test(name));
  const authors = names.length > 3 ? `${names.slice(0, 3).join(", ")}, ${chinese ? "等" : "et al."}` : names.join(", ");
  const year = yearOf(item);
  const title = titleOf(item).replace(/[.?!]$/, "");
  const doi = doiOf(item.links.original);
  const head = authors ? `${authors}. ` : "";
  if (isArxiv(item)) return `${head}${title}[J/OL]. arXiv${year ? `, ${year}` : ""}. ${item.links.original}.`;
  const published = [item.source.name, year, `${item.volume ?? ""}${item.issue ? `(${item.issue})` : ""}`].filter(Boolean).join(", ");
  return `${head}${title}[J]. ${published}.${doi ? ` DOI:${doi}.` : ""}`;
}
