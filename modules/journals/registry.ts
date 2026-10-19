// 这个站跟的期刊清单（industry/journals.json）：期刊页的名字与学科、按刊 RSS 的标题，以及每本刊的论文
// 挂在哪个信源下（scripts/journals.ts 用同样的规则建信源）。只在接口与 worker 里读，网页从接口拿。
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import type { JournalRef } from "./types.ts";

const FILE = path.join(REPO_ROOT, "industry", "journals.json");

/** 一本刊的论文挂在哪个信源下：journals.ts 建信源时用的 id。 */
export function sourceIdOf(issn: string): string {
  return `journal-${issn.trim().toLowerCase()}`;
}

let loaded: readonly JournalRef[] | null = null;

/** 清单里的每一本刊，按文件里的顺序。 */
export function journals(): readonly JournalRef[] {
  if (!loaded) {
    const file = JSON.parse(readFileSync(FILE, "utf8")) as { journals: Array<Omit<JournalRef, "sourceId">> };
    loaded = file.journals.map((journal) => ({
      issn: journal.issn,
      name: journal.name,
      discipline: journal.discipline,
      tier: journal.tier,
      sourceId: sourceIdOf(journal.issn),
    }));
  }
  return loaded;
}

/** 一本刊，ISSN 不区分大小写；不在清单里就是 null。 */
export function journalOf(issn: string): JournalRef | null {
  const want = issn.trim().toLowerCase();
  return journals().find((journal) => journal.issn.toLowerCase() === want) ?? null;
}

/** 一区（T1）的刊：首页「今日顶刊」只取这些。 */
export function firstTier(): JournalRef[] {
  return journals().filter((journal) => journal.tier === "T1");
}
