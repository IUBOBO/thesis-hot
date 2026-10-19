import { ITEM_COPY } from "@aihot/site";

/**
 * The AI score as a row of stars (0–5), tinted by tier: strong picks (85+) in warm red, solid ones (70+)
 * in the accent, the rest as quiet text. The 0–100 score itself is kept for the API and the backend.
 */
const TIERS = [
  { min: 85, className: "bg-hot/10 text-hot ring-hot/25" },
  { min: 70, className: "bg-accent-soft text-accent ring-accent/20" },
  { min: 0, className: "text-ink-4 ring-line-soft" },
];

/** The score readers see: none when the site keeps scores from them. */
export function shownScore(score: number | null): number | null {
  return ITEM_COPY.showScore ? score : null;
}

/** "★★★★☆" with a hover note on how it is read. One markup for every screen size. */
export function ScoreLabel({ score }: { score: number | null }) {
  const shown = shownScore(score);
  if (shown === null) return null;
  const value = Math.round(shown);
  const tier = TIERS.find((t) => value >= t.min)!;
  const stars = Math.round(value / 20);
  const label = `推荐度 ${stars} / 5`;
  return (
    <span
      title={`${label}：由模型综合评定的参考值，不代表论文的最终质量`}
      aria-label={label}
      className={`inline-flex h-[20px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[12px] leading-none tracking-[0.08em] ring-1 ring-inset ${tier.className}`}
    >
      <span aria-hidden="true">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span>
    </span>
  );
}
