// 单刊页与按刊 RSS 的地址：网页、接口和 RSS 里用同一份，换路径时一处改完。
export function journalPagePath(issn: string): string {
  return `/journal/${issn.toLowerCase()}`;
}

export function journalFeedPath(issn: string): string {
  return `/feed/journal/${issn.toLowerCase()}.xml`;
}
