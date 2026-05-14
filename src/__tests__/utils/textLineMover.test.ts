import { describe, it, expect } from 'vitest';
import { moveSelectedLines } from '../../utils/textLineMover';

const move = (text: string, selStart: number, selEnd: number, direction: 'up' | 'down') =>
  moveSelectedLines({ text, selectionStart: selStart, selectionEnd: selEnd, direction });

describe('moveSelectedLines — up', () => {
  it('swaps current line with the one above (caret on line 2)', () => {
    const text = 'aaa\nbbb\nccc';
    const caret = 5; // inside "bbb"
    const result = move(text, caret, caret, 'up');
    expect(result).toEqual({
      text: 'bbb\naaa\nccc',
      selectionStart: 1,
      selectionEnd: 1,
    });
  });

  it('returns null when the selection is on the first line', () => {
    const text = 'aaa\nbbb';
    expect(move(text, 0, 0, 'up')).toBeNull();
    expect(move(text, 2, 2, 'up')).toBeNull();
  });

  it('moves a multi-line selection as a block', () => {
    const text = 'aaa\nbbb\nccc\nddd';
    // select from start of bbb to end of ccc
    const selStart = 4;
    const selEnd = 11;
    const result = move(text, selStart, selEnd, 'up');
    expect(result?.text).toBe('bbb\nccc\naaa\nddd');
    expect(result?.selectionStart).toBe(0);
    expect(result?.selectionEnd).toBe(7);
  });

  it('treats selection ending at column 0 of the next line as exclusive', () => {
    const text = 'aaa\nbbb\nccc\nddd';
    // select "bbb\n" (end at start of ccc) — only "bbb" should move
    const selStart = 4;
    const selEnd = 8;
    const result = move(text, selStart, selEnd, 'up');
    expect(result?.text).toBe('bbb\naaa\nccc\nddd');
  });

  it('preserves a trailing empty last line', () => {
    const text = 'aaa\nbbb\n';
    const result = move(text, 4, 4, 'up');
    expect(result?.text).toBe('bbb\naaa\n');
  });
});

describe('moveSelectedLines — down', () => {
  it('swaps current line with the one below', () => {
    const text = 'aaa\nbbb\nccc';
    const caret = 1; // inside "aaa"
    const result = move(text, caret, caret, 'down');
    expect(result).toEqual({
      text: 'bbb\naaa\nccc',
      selectionStart: 5,
      selectionEnd: 5,
    });
  });

  it('returns null when the selection is on the last line', () => {
    const text = 'aaa\nbbb';
    expect(move(text, 6, 6, 'down')).toBeNull();
  });

  it('treats trailing newline as a valid last position', () => {
    // text ends with \n; last "line" is empty. Caret on bbb (penultimate non-empty line)
    // can still move down past the empty line? We choose: trailing empty line counts
    // as a real line — moving "bbb" down swaps it with the empty line.
    const text = 'aaa\nbbb\n';
    const result = move(text, 4, 4, 'down');
    expect(result?.text).toBe('aaa\n\nbbb');
  });

  it('moves a multi-line selection downward', () => {
    const text = 'aaa\nbbb\nccc\nddd';
    // select "aaa" and "bbb"
    const selStart = 0;
    const selEnd = 7;
    const result = move(text, selStart, selEnd, 'down');
    expect(result?.text).toBe('ccc\naaa\nbbb\nddd');
    expect(result?.selectionStart).toBe(4);
    expect(result?.selectionEnd).toBe(11);
  });
});

describe('moveSelectedLines — edge cases', () => {
  it('handles a single-line document (no movement possible)', () => {
    expect(move('hello', 2, 2, 'up')).toBeNull();
    expect(move('hello', 2, 2, 'down')).toBeNull();
  });

  it('handles empty text', () => {
    expect(move('', 0, 0, 'up')).toBeNull();
    expect(move('', 0, 0, 'down')).toBeNull();
  });

  it('keeps selection inside the moved block when swapping up', () => {
    const text = 'first\nSECOND\nthird';
    // caret in middle of SECOND
    const caret = 9; // 'second' starts at 6, 9 = 'CO|ND'
    const result = move(text, caret, caret, 'up');
    expect(result?.text).toBe('SECOND\nfirst\nthird');
    // SECOND now starts at 0; caret offset within line stayed at 3
    expect(result?.selectionStart).toBe(3);
  });
});
