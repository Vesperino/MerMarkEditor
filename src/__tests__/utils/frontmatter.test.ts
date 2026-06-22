import { describe, it, expect } from 'vitest';
import { getFrontmatterKey, setFrontmatterKey, removeFrontmatterKey } from '../../utils/frontmatter';

const RAW = 'marp: true\ntheme: gaia\npaginate: true';

describe('frontmatter helper', () => {
  it('gets an existing key', () => {
    expect(getFrontmatterKey(RAW, 'theme')).toBe('gaia');
    expect(getFrontmatterKey(RAW, 'missing')).toBeNull();
  });

  it('replaces an existing key in place', () => {
    expect(setFrontmatterKey(RAW, 'theme', 'uncover')).toContain('theme: uncover');
    expect(setFrontmatterKey(RAW, 'theme', 'uncover')).not.toContain('theme: gaia');
  });

  it('appends a missing key', () => {
    const out = setFrontmatterKey(RAW, 'size', '16:9');
    expect(out).toContain('marp: true');
    expect(out.trimEnd().endsWith('size: 16:9')).toBe(true);
  });

  it('toggles a boolean round-trip', () => {
    expect(getFrontmatterKey(setFrontmatterKey(RAW, 'paginate', 'false'), 'paginate')).toBe('false');
  });

  it('inserts a value containing $ literally', () => {
    expect(getFrontmatterKey(setFrontmatterKey(RAW, 'theme', 'a$1b'), 'theme')).toBe('a$1b');
  });

  it('removes a key, leaving the rest intact', () => {
    const withStyle = setFrontmatterKey(RAW, 'style', 'section { font-size: 22px; }');
    const out = removeFrontmatterKey(withStyle, 'style');
    expect(getFrontmatterKey(out, 'style')).toBeNull();
    expect(getFrontmatterKey(out, 'theme')).toBe('gaia');
  });
});
