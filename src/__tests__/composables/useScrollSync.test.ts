import { describe, it, expect } from 'vitest';
import { proportionalTarget } from '../../composables/useScrollSync';

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
