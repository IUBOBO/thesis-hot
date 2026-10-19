// Flame-colored rank: the top of the heat list runs red → orange → gold; ranks past the top ten cool to gray.
export function flameColor(rank: number, total = 10): string {
  if (rank < 1 || rank > total) return "#94a3b8";
  const t = (rank - 1) / Math.max(total - 1, 1);
  const hue = 2 + t * 44;
  const saturation = 86 - t * 32;
  const lightness = 42 + t * 10;
  return `hsl(${hue.toFixed(0)} ${saturation.toFixed(0)}% ${lightness.toFixed(0)}%)`;
}
