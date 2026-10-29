// Shared pieces of the answer charts: the order and names of the parts, percentages and pixel-exact bars.
import { useEffect, useState } from 'react';
import type { Verdict } from '../types';

// Bottom to top in each bar, so the right answers stand on the baseline. Same words as the history rows.
export const SEGMENTS: { verdict: Verdict; label: string }[] = [
  { verdict: 'correct', label: 'без ошибок' },
  { verdict: 'almost', label: 'почти' },
  { verdict: 'wrong', label: 'с ошибками' },
];

/**
 * Whole percents that add up to exactly 100 (57 + 20 + 24 would show 101): round down, then give the missing points
 * to the largest remainders. Null when there are no answers.
 */
export function wholeShares(verdicts: Record<Verdict, number>): Record<Verdict, number> | null {
  const total = verdicts.correct + verdicts.almost + verdicts.wrong;
  if (!total) return null;
  const exact = SEGMENTS.map(({ verdict }) => ({ verdict, value: (verdicts[verdict] / total) * 100 }));
  const shares = Object.fromEntries(exact.map(({ verdict, value }) => [verdict, Math.floor(value)])) as Record<Verdict, number>;
  let missing = 100 - Object.values(shares).reduce((sum, v) => sum + v, 0);
  for (const { verdict } of [...exact].sort((a, b) => (b.value % 1) - (a.value % 1))) {
    if (missing-- <= 0) break;
    shares[verdict]++;
  }
  return shares;
}

/** Screen pixels per CSS pixel; follows browser zoom and moving the window to another screen. */
export function useDevicePixelRatio() {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const query = matchMedia(`(resolution: ${ratio}dppx)`);
    const update = () => setRatio(window.devicePixelRatio || 1);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [ratio]);
  return ratio;
}

// The plot's height in CSS pixels; matches .week__plot.
export const PLOT_HEIGHT = 140;
const SEGMENT_GAP = 2;

/**
 * Heights of a bar's parts in whole screen pixels. At 125% or 150% scaling a 2px gap at a fractional position is
 * smoothed into a blur of a different width each time, so every edge is put on a screen pixel instead, and the
 * rounding goes to the largest remainders so the bar keeps its height.
 */
export function segmentHeights(counts: number[], barHeight: number, ratio: number) {
  const gap = Math.max(1, Math.round(SEGMENT_GAP * ratio));
  const minimum = Math.max(1, Math.round(2 * ratio));
  const total = counts.reduce((sum, n) => sum + n, 0);
  const room = Math.max(Math.round(barHeight * ratio) - gap * (counts.length - 1), minimum * counts.length);
  const exact = counts.map((n) => (n / total) * room);
  const pixels = exact.map((v) => Math.max(minimum, Math.floor(v)));
  let missing = room - pixels.reduce((sum, v) => sum + v, 0);
  for (const i of exact.map((_, i) => i).sort((a, b) => (exact[b] % 1) - (exact[a] % 1))) {
    if (missing-- <= 0) break;
    pixels[i]++;
  }
  return { gap: gap / ratio, heights: pixels.map((v) => v / ratio) };
}
