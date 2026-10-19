// 详情页「来源」栏里的一行：这篇论文被引多少次，数据截至哪一天。
// 引用数在正文之后才到（接口按篇读），慢一点不影响阅读；没有信号就什么都不画。
import { useEffect, useState } from "react";
import type { PaperSignal } from "../types";

export default function ItemFacts({ load }: { itemId: string; load: string }) {
  const [signal, setSignal] = useState<PaperSignal | null>(null);
  useEffect(() => {
    let live = true;
    fetch(load)
      .then((res) => (res.ok ? (res.json() as Promise<PaperSignal>) : null))
      .then((data) => {
        if (live) setSignal(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [load]);
  if (!signal) return null;
  return (
    <div className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
      被引 <span className="num">{signal.cites}</span>
      <span className="text-ink-4"> · 截至 {signal.day}（OpenAlex）</span>
    </div>
  );
}
