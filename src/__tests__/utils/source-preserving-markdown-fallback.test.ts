import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diffArrays, diffChars, diffLines } from 'diff';
import { markdownToHtml } from '../../utils/markdown-converter';
import { sourcePreservingMarkdown } from '../../utils/source-preserving-markdown';

// Simulate the diff library reaching its work limit; wall-clock timeout tests
// would depend on machine speed. The converter and normal diff remain real.
vi.mock('diff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('diff')>();
  return { ...actual, diffArrays: vi.fn(actual.diffArrays), diffChars: vi.fn(actual.diffChars), diffLines: vi.fn(actual.diffLines) };
});

// Select the timeout overload; ReturnType alone picks diff's final overload,
// which does not include the undefined result of an exhausted work limit.
type TimedDiff = (before: string, after: string, options: { timeout: number }) => ReturnType<typeof diffChars> | undefined;
const characterDiff = vi.mocked(diffChars as TimedDiff);
const lineDiff = vi.mocked(diffLines as TimedDiff);

describe('source-preserving serialization fallbacks', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('skips diff work when visual content has not changed', () => {
    const source = 'first\nwrapped\n\n\nlast\n';
    expect(sourcePreservingMarkdown(markdownToHtml(source), source)).toBe(source);
    expect(diffChars).not.toHaveBeenCalled();
    expect(diffLines).not.toHaveBeenCalled();
    expect(diffArrays).not.toHaveBeenCalled();
  });

  it('writes all current content with the original line endings when source alignment times out', () => {
    vi.mocked(diffArrays).mockReturnValueOnce(undefined as never);
    const result = sourcePreservingMarkdown('<p>new content</p><p>second</p>', 'old\r\n\r\nsecond\r\n');
    expect(result).toBe('new content\r\n\r\nsecond');
  });

  it('writes the current content when calculating character edits times out', async () => {
    const actual = await vi.importActual<typeof import('diff')>('diff');
    characterDiff.mockImplementation((before, after, options) => before === 'old content' && after === 'new content'
      ? undefined : actual.diffChars(before, after, options));
    expect(sourcePreservingMarkdown('<p>new content</p>', 'old content\n')).toBe('new content');
  });

  it('replaces only the affected line when inline HTML formatting cannot be patched by characters', () => {
    const source = 'first\nwrapped\n\nBefore <strong>bold</strong> text\n\nlast\nwrapped\n';
    const html = markdownToHtml(source).replace('<strong>bold</strong>', 'bold');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('<strong>bold</strong>', 'bold'));
    expect(diffLines).toHaveBeenCalled();
  });

  it('falls back without losing edits when line reconciliation also times out', () => {
    lineDiff.mockReturnValueOnce(undefined);
    const source = 'Before <strong>bold</strong> text\n';
    const html = markdownToHtml(source).replace('<strong>bold</strong>', 'bold');
    expect(sourcePreservingMarkdown(html, source)).toBe('Before bold text');
    expect(diffLines).toHaveBeenCalled();
  });
});
