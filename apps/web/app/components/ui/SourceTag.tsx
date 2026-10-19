// 期刊/来源名的小标签：所有出现来源的地方共用，避免有的地方是灰字、有的地方是标签。
import { IconDoc } from "../icons";

/** A source/journal name as a small tag; `sm` for dense lists, `md` for feed cards. */
export function SourceTag({ name, size = "md", className = "" }: { name: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-bg-sunk px-2 py-0.5 font-semibold text-ink-2 ring-1 ring-inset ring-line-soft ${size === "sm" ? "text-[11.5px]" : "text-[13px]"} ${className}`}>
      <IconDoc size={size === "sm" ? 11 : 12} className="shrink-0 text-ink-3" />
      <span className="truncate">{name}</span>
    </span>
  );
}
