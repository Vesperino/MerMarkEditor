export interface HeadingTop {
  id: string;
  top: number;
}

/**
 * Pick the heading whose section the reader is currently in: the last heading
 * at or above the threshold. When the reader is scrolled above the first
 * heading, fall back to the first so something is always highlighted.
 *
 * `atBottom` forces the last heading: at the end of the document the trailing
 * headings can never scroll up to the threshold, so without this they would
 * stay un-highlighted.
 */
export function pickActiveHeading(
  tops: HeadingTop[],
  threshold: number,
  atBottom = false,
): string | null {
  if (tops.length === 0) return null;
  if (atBottom) return tops[tops.length - 1].id;
  let active: string | null = null;
  for (const h of tops) {
    if (h.top <= threshold) active = h.id;
  }
  return active ?? tops[0].id;
}
