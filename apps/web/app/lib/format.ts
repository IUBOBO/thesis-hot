import { beijingDate, beijingTime, beijingWeekday } from "@aihot/contracts/time";

/** "9月28日" of a calendar date (YYYY-MM-DD). */
export function monthDay(date: string): string {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

/** "周六" of a calendar date (YYYY-MM-DD). */
export function weekdayShort(date: string): string {
  return beijingWeekday(date).replace("星期", "周");
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "刚刚";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} 天前`;
  return beijingDate(iso);
}

export function fullDateTime(iso: string): string {
  return `${beijingDate(iso)} ${beijingTime(iso)}`;
}

/** "9月24日 10:51" (Beijing), for lists that span days. */
export function monthDayTime(iso: string): string {
  return `${monthDay(beijingDate(iso))} ${beijingTime(iso)}`;
}

export function sourceInitial(name: string): string {
  const s = name.replace(/^[^\p{L}\p{N}]+/u, "");
  return (s[0] ?? "A").toUpperCase();
}

/**
 * Chemical formulas in model-written Chinese copy: the model writes "CO2" or "NOX", the reader sees
 * CO₂ or NOₓ. Only stand-alone formulas are converted, so a name like "CO2e" or a unit like
 * "PM2.5" stays as it is. Markdown escapes left by an older writer (`1\.0`) are dropped too.
 */
const FORMULAS: ReadonlyArray<[RegExp, string]> = [
  [/(?<![A-Za-z0-9])H2SO4(?![A-Za-z0-9])/g, "H₂SO₄"],
  [/(?<![A-Za-z0-9])CaCO3(?![A-Za-z0-9])/g, "CaCO₃"],
  [/(?<![A-Za-z0-9])NOX(?![A-Za-z0-9])/g, "NOₓ"],
  [/(?<![A-Za-z0-9])NOx(?![A-Za-z0-9])/g, "NOₓ"],
  [/(?<![A-Za-z0-9])SiO2(?![A-Za-z0-9])/g, "SiO₂"],
  [/(?<![A-Za-z0-9])TiO2(?![A-Za-z0-9])/g, "TiO₂"],
  [/(?<![A-Za-z0-9])H2O2(?![A-Za-z0-9])/g, "H₂O₂"],
  [/(?<![A-Za-z0-9])CH4(?![A-Za-z0-9])/g, "CH₄"],
  [/(?<![A-Za-z0-9])CO2(?![A-Za-z0-9])/g, "CO₂"],
  [/(?<![A-Za-z0-9])SO2(?![A-Za-z0-9])/g, "SO₂"],
  [/(?<![A-Za-z0-9])NO2(?![A-Za-z0-9])/g, "NO₂"],
  [/(?<![A-Za-z0-9])N2O(?![A-Za-z0-9])/g, "N₂O"],
  [/(?<![A-Za-z0-9])NH3(?![A-Za-z0-9])/g, "NH₃"],
  [/(?<![A-Za-z0-9])H2S(?![A-Za-z0-9])/g, "H₂S"],
  [/(?<![A-Za-z0-9])H2O(?![A-Za-z0-9])/g, "H₂O"],
  [/(?<![A-Za-z0-9])O3(?![A-Za-z0-9])/g, "O₃"],
  [/(?<![A-Za-z0-9])H2(?![A-Za-z0-9])/g, "H₂"],
  [/(?<![A-Za-z0-9])O2(?![A-Za-z0-9])/g, "O₂"],
  [/(?<![A-Za-z0-9])N2(?![A-Za-z0-9])/g, "N₂"],
  [/(?<![A-Za-z0-9])Hg0(?![A-Za-z0-9])/g, "Hg⁰"],
];

/** Reader copy as it should look: formulas with subscripts, no Markdown backslash escapes. */
export function readerText(text: string): string {
  let out = text.replace(/\\([.()\-_*#[\]])/g, "$1");
  for (const [pattern, replacement] of FORMULAS) out = out.replace(pattern, replacement);
  return out;
}
