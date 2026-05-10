import { describe, expect, it, vi } from 'vitest';
import { useDocumentSearch, findLiteralMatches, type DocumentSearchMatch } from '../../composables/useDocumentSearch';

describe('useDocumentSearch', () => {
  it('finds literal matches case-insensitively', () => {
    const matches = findLiteralMatches('Alpha beta ALPHA', 'alpha');

    expect(matches).toEqual([
      { id: '0:5', index: 0, start: 0, end: 5 },
      { id: '11:16', index: 1, start: 11, end: 16 },
    ]);
  });

  it('returns no matches for an empty query', () => {
    expect(findLiteralMatches('Alpha', '')).toEqual([]);
  });

  it('cycles forward and backward through code matches', async () => {
    const focused: DocumentSearchMatch[] = [];
    const search = useDocumentSearch({
      getMode: () => 'code',
      getCodeText: () => 'one two one two',
      getVisualTextAndMap: () => null,
      focusCodeMatch: (match) => focused.push(match),
      focusVisualMatch: vi.fn(),
      applyVisualHighlights: vi.fn(),
      clearVisualHighlights: vi.fn(),
    });

    await search.open('one');

    expect(search.state.value.matches).toHaveLength(2);
    expect(search.state.value.activeIndex).toBe(0);

    search.next();
    expect(search.state.value.activeIndex).toBe(1);
    expect(focused[focused.length - 1]?.start).toBe(8);

    search.next();
    expect(search.state.value.activeIndex).toBe(0);
    expect(focused[focused.length - 1]?.start).toBe(0);

    search.previous();
    expect(search.state.value.activeIndex).toBe(1);
    expect(focused[focused.length - 1]?.start).toBe(8);
  });

  it('applies visual highlights when visual results change', async () => {
    const applyVisualHighlights = vi.fn();
    const search = useDocumentSearch({
      getMode: () => 'visual',
      getCodeText: () => '',
      getVisualTextAndMap: () => ({
        text: 'hello world hello',
        positions: Array.from({ length: 'hello world hello'.length }, (_, index) => index + 1),
      }),
      focusCodeMatch: vi.fn(),
      focusVisualMatch: vi.fn(),
      applyVisualHighlights,
      clearVisualHighlights: vi.fn(),
    });

    await search.open('hello');

    expect(search.state.value.matches).toHaveLength(2);
    expect(applyVisualHighlights).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ from: 1, to: 6 }),
        expect.objectContaining({ from: 13, to: 18 }),
      ]),
      0
    );

    search.next();
    expect(applyVisualHighlights).toHaveBeenLastCalledWith(expect.any(Array), 1);
  });
});
