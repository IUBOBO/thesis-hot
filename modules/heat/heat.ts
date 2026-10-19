// 热度的算法只在这里：三个信号各算「每天涨多少」（总数除以上线天数），按 5:3:2 加权；
// 还没有来源的项不计入，权重在剩下的项里归一。引用来自 OpenAlex，讨论来自站内同一事件的其他信源，代码暂无来源。
export const HEAT_WEIGHTS = { cites: 0.5, discussions: 0.3, stars: 0.2 } as const;

export interface HeatParts {
  cites: number | null;
  discussions: number | null;
  stars: number | null;
  /** 上线天数，至少 1。 */
  ageDays: number;
}

/** 热度指数，保留一位小数。 */
export function heatOf(parts: HeatParts): number {
  const days = Math.max(1, parts.ageDays);
  let total = 0;
  let weights = 0;
  for (const key of Object.keys(HEAT_WEIGHTS) as Array<keyof typeof HEAT_WEIGHTS>) {
    const value = parts[key];
    if (value === null || value === undefined) continue;
    total += HEAT_WEIGHTS[key] * (value / days);
    weights += HEAT_WEIGHTS[key];
  }
  return weights === 0 ? 0 : Math.round((100 * total) / weights * 10) / 10;
}
