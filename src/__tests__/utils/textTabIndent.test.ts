import { describe, it, expect } from 'vitest';
import { applyTabIndent } from '../../utils/textTabIndent';

const apply = (
  text: string,
  selectionStart: number,
  selectionEnd: number,
  direction: 'indent' | 'outdent',
) => applyTabIndent({ text, selectionStart, selectionEnd, direction });

describe('applyTabIndent — indent', () => {
  it('inserts a tab at the caret', () => {
    expect(apply('abc', 1, 1, 'indent')).toEqual({
      text: 'a\tbc',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('replaces a single-line selection with a tab', () => {
    expect(apply('abcdef', 1, 4, 'indent')).toEqual({
      text: 'a\tef',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('indents every selected line and adjusts the selection', () => {
    expect(apply('one\ntwo\nthree', 1, 10, 'indent')).toEqual({
      text: '\tone\n\ttwo\n\tthree',
      selectionStart: 2,
      selectionEnd: 13,
    });
  });

  it('excludes a line when the selection ends at its start', () => {
    expect(apply('one\ntwo\nthree', 1, 8, 'indent')).toEqual({
      text: '\tone\n\ttwo\nthree',
      selectionStart: 2,
      selectionEnd: 10,
    });
  });
});

describe('applyTabIndent — outdent', () => {
  it('removes one leading tab from every selected line', () => {
    expect(apply('\tone\n\t\ttwo\nthree', 0, 16, 'outdent')).toEqual({
      text: 'one\n\ttwo\nthree',
      selectionStart: 0,
      selectionEnd: 14,
    });
  });

  it('removes up to four leading spaces from every selected line', () => {
    expect(apply('    one\n  two', 2, 13, 'outdent')).toEqual({
      text: 'one\ntwo',
      selectionStart: 0,
      selectionEnd: 7,
    });
  });

  it('keeps a caret from crossing its line start', () => {
    expect(apply('first\n    second', 8, 8, 'outdent')).toEqual({
      text: 'first\nsecond',
      selectionStart: 6,
      selectionEnd: 6,
    });
  });

  it('returns null when no touched line can be outdented', () => {
    expect(apply('one\ntwo', 0, 7, 'outdent')).toBeNull();
  });
});
