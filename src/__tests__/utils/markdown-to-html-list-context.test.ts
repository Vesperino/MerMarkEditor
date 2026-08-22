import { describe, it, expect } from 'vitest';
import { computeListContexts } from '../../utils/markdown-to-html';

describe('computeListContexts', () => {
  it('marks lines after a list item as inside list context', () => {
    const lines = ['- item', '    continuation', '    more'];
    expect(computeListContexts(lines)).toEqual([false, true, true]);
  });

  it('resets context after a plain paragraph line', () => {
    const lines = ['- item', 'paragraph', '    indented'];
    expect(computeListContexts(lines)).toEqual([false, true, false]);
  });

  it('keeps context across blank lines', () => {
    const lines = ['- item', '', '    continuation'];
    expect(computeListContexts(lines)).toEqual([false, true, true]);
  });

  it('keeps context across continuation-indented lines', () => {
    const lines = ['1. item', '  cont', '', '  cont2', 'plain', '    code?'];
    expect(computeListContexts(lines)).toEqual([false, true, true, true, true, false]);
  });

  it('starts with no context at document top', () => {
    const lines = ['    indented first line'];
    expect(computeListContexts(lines)).toEqual([false]);
  });
});
