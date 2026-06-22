import { describe, it, expect } from 'vitest';
import { targetScrollTop } from '../../utils/scroll';

// Issue #114: clicking a ToC heading must land it near the TOP of the viewport
// (with a toolbar offset), not the bottom. targetScrollTop encodes that intent.
describe('targetScrollTop (issue #114)', () => {
  it('scrolls a heading below the fold up to `offset` px below the container top', () => {
    // container top = 100, heading currently at y=700 (near bottom), scrollTop = 0
    expect(targetScrollTop(100, 700, 0, 80)).toBe(520); // 700 - 100 + 0 - 80
  });

  it('keeps the same offset gap regardless of the current scroll position', () => {
    expect(targetScrollTop(100, 300, 1000, 80)).toBe(1120); // 300 - 100 + 1000 - 80
  });

  it('never returns a negative scrollTop when the heading is already near the top', () => {
    expect(targetScrollTop(100, 110, 0, 80)).toBe(0); // raw -70 -> clamped to 0
  });

  it('lands the heading exactly `offset` px below the container top (not the bottom)', () => {
    const containerTop = 50, targetTop = 900, scrollTop = 200, offset = 80;
    const newScrollTop = targetScrollTop(containerTop, targetTop, scrollTop, offset);
    // where the heading ends up relative to the container top after scrolling:
    const finalTop = targetTop - (newScrollTop - scrollTop) - containerTop;
    expect(finalTop).toBe(offset);
  });
});
