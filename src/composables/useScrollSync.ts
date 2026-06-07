/**
 * Map a scroll position on one element to the equivalent proportional position
 * on another. Returns 0 when either element has no scroll range.
 */
export function proportionalTarget(
  srcTop: number,
  srcScrollH: number,
  srcClientH: number,
  dstScrollH: number,
  dstClientH: number,
): number {
  const srcMax = srcScrollH - srcClientH;
  const dstMax = dstScrollH - dstClientH;
  if (srcMax <= 0 || dstMax <= 0) return 0;
  const ratio = Math.min(Math.max(srcTop / srcMax, 0), 1);
  return ratio * dstMax;
}
