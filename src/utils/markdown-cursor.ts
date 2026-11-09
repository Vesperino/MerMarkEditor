import { diffChars } from 'diff';

/** Translate a caret within one paragraph between rendered text and its
 * Markdown. Only cursor placement uses this bounded alignment; it never edits
 * source. Both strings and the offset must use LF editor coordinates. */
export function mapMarkdownCursor(before: string, after: string, offset: number): number | null {
  const changes = diffChars(before, after, { timeout: 20 });
  if (!changes) return null;
  const target = Math.max(0, Math.min(offset, before.length));
  let from = 0;
  let to = 0;
  for (const change of changes) {
    if (change.added) {
      to += change.value.length;
    } else if (change.removed) {
      if (target < from + change.value.length) return to;
      from += change.value.length;
    } else {
      if (target <= from + change.value.length) return to + target - from;
      from += change.value.length;
      to += change.value.length;
    }
  }
  return to;
}
