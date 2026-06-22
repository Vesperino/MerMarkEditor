import { describe, it, expect, vi } from 'vitest';
import { proportionalTarget, scrollTopFromRatio, useScrollSync } from '../../composables/useScrollSync';

describe('proportionalTarget', () => {
  it('maps the top of the source to the top of the destination', () => {
    expect(proportionalTarget(0, 1000, 200, 2000, 200)).toBe(0);
  });

  it('maps the bottom of the source to the bottom of the destination', () => {
    // srcMax = 800, dstMax = 1800, ratio = 1
    expect(proportionalTarget(800, 1000, 200, 2000, 200)).toBe(1800);
  });

  it('maps the middle of the source proportionally', () => {
    // srcMax = 800, srcTop 400 -> ratio 0.5, dstMax 1800 * 0.5 = 900
    expect(proportionalTarget(400, 1000, 200, 2000, 200)).toBe(900);
  });

  it('returns 0 when the source has no scroll range', () => {
    expect(proportionalTarget(0, 200, 200, 2000, 200)).toBe(0);
    expect(proportionalTarget(50, 100, 200, 2000, 200)).toBe(0);
  });

  it('returns 0 when the destination has no scroll range', () => {
    expect(proportionalTarget(400, 1000, 200, 200, 200)).toBe(0);
  });

  it('clamps a source position beyond its range', () => {
    expect(proportionalTarget(99999, 1000, 200, 2000, 200)).toBe(1800);
  });
});

describe('scrollTopFromRatio', () => {
  it('maps a 0.5 ratio to half the scrollable range', () => {
    expect(scrollTopFromRatio(0.5, 1000, 500)).toBe(250);
  });

  it('returns 0 when content fits the viewport (no scroll range)', () => {
    expect(scrollTopFromRatio(0.5, 500, 500)).toBe(0);
  });

  it('returns 0 for a zero ratio', () => {
    expect(scrollTopFromRatio(0, 1000, 200)).toBe(0);
  });

  it('clamps a ratio above 1 to the bottom of the range', () => {
    expect(scrollTopFromRatio(1.5, 1000, 200)).toBe(800);
  });

  it('clamps a negative ratio to 0', () => {
    expect(scrollTopFromRatio(-0.3, 1000, 200)).toBe(0);
  });

  it('handles content shorter than the viewport (negative max scroll)', () => {
    expect(scrollTopFromRatio(0.7, 100, 500)).toBe(0);
  });

  it('rounds to an integer scrollTop', () => {
    expect(scrollTopFromRatio(1 / 3, 1000, 100)).toBe(300);
  });
});

describe('useScrollSync attach/detach', () => {
  it('adds scroll listeners on attach and removes them on detach', () => {
    const code = document.createElement('div');
    const preview = document.createElement('div');
    const codeAdd = vi.spyOn(code, 'addEventListener');
    const codeRemove = vi.spyOn(code, 'removeEventListener');
    const previewAdd = vi.spyOn(preview, 'addEventListener');
    const previewRemove = vi.spyOn(preview, 'removeEventListener');

    const sync = useScrollSync();
    sync.attach(code, preview);
    expect(codeAdd).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(previewAdd).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });

    sync.detach();
    expect(codeRemove).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(previewRemove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
