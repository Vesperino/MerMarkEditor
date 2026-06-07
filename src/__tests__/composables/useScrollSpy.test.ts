import { describe, it, expect } from 'vitest';
import { pickActiveHeading } from '../../composables/useScrollSpy';

describe('pickActiveHeading', () => {
  const THRESHOLD = 80;

  it('returns null when there are no headings', () => {
    expect(pickActiveHeading([], THRESHOLD)).toBeNull();
  });

  it('returns the last heading at or above the threshold', () => {
    const tops = [
      { id: 'a', top: -100 },
      { id: 'b', top: 40 },
      { id: 'c', top: 300 },
    ];
    expect(pickActiveHeading(tops, THRESHOLD)).toBe('b');
  });

  it('returns the last heading when all are above the threshold', () => {
    const tops = [
      { id: 'a', top: -300 },
      { id: 'b', top: -100 },
    ];
    expect(pickActiveHeading(tops, THRESHOLD)).toBe('b');
  });

  it('falls back to the first heading when all are below the threshold', () => {
    const tops = [
      { id: 'a', top: 200 },
      { id: 'b', top: 500 },
    ];
    expect(pickActiveHeading(tops, THRESHOLD)).toBe('a');
  });
});
