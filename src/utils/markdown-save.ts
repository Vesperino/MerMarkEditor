import type { Tab } from '../composables/useTabs';
import { applyLineEnding, detectLineEnding } from './markdown-converter';
import { sourcePreservingMarkdown } from './source-preserving-markdown';

export const normalizeMarkdown = (text: string): string => text.replace(/\r\n?/g, '\n');

export type MarkdownContent = { markdown: string } | { html: string };

/** Editor coordinates use LF. Disk serialization retains the existing EOL
 * convention; unchanged raw text keeps even mixed separators byte-for-byte.
 * After edits, mixed-EOL files use their saved dominant convention. */
export function serializeMarkdown(content: MarkdownContent, source?: string | null, disk?: string | null): string {
  if ('html' in content) return sourcePreservingMarkdown(content.html, source ?? disk);
  const raw = content.markdown;
  if (source != null && normalizeMarkdown(raw) === normalizeMarkdown(source)) return source;
  if (source == null && disk != null && normalizeMarkdown(raw) === normalizeMarkdown(disk)) return disk;
  const baseline = disk ?? source;
  return baseline == null ? raw : applyLineEnding(raw, detectLineEnding(baseline));
}

export interface MarkdownSaveSnapshot {
  content: MarkdownContent;
  originalMarkdown: string | null;
  markdown: string;
}

export function captureMarkdownSave(tab: Tab, content: MarkdownContent): MarkdownSaveSnapshot {
  return {
    content,
    originalMarkdown: tab.originalMarkdown,
    markdown: serializeMarkdown(content, tab.sourceMarkdown, tab.originalMarkdown),
  };
}

/** A mode switch is conservatively considered changed: do not clear dirty
 * state or replace source belonging to a newer editor revision. */
export function matchesMarkdownSave(snapshot: MarkdownSaveSnapshot, current: MarkdownContent): boolean {
  return 'markdown' in snapshot.content && 'markdown' in current
    ? normalizeMarkdown(snapshot.content.markdown) === normalizeMarkdown(current.markdown)
    : 'html' in snapshot.content && 'html' in current && snapshot.content.html === current.html;
}
