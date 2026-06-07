export interface HeadingTop {
  id: string;
  top: number;
}

/**
 * Pick the heading whose section the reader is currently in: the last heading
 * at or above the threshold. When the reader is scrolled above the first
 * heading, fall back to the first so something is always highlighted.
 */
export function pickActiveHeading(tops: HeadingTop[], threshold: number): string | null {
  if (tops.length === 0) return null;
  let active: string | null = null;
  for (const h of tops) {
    if (h.top <= threshold) active = h.id;
  }
  return active ?? tops[0].id;
}
