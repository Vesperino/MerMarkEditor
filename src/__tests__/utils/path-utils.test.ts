import { describe, it, expect } from 'vitest';
import {
  basenameOf,
  dirnameOf,
  joinPath,
  isAncestor,
  pathSegments,
  ancestorsBetween,
  trimTrailingSep,
} from '../../utils/path-utils';

describe('basenameOf', () => {
  it('returns last segment of POSIX paths', () => {
    expect(basenameOf('/a/b/c.md')).toBe('c.md');
  });
  it('returns last segment of Windows paths', () => {
    expect(basenameOf('C:\\a\\b\\c.md')).toBe('c.md');
  });
  it('handles trailing slash', () => {
    expect(basenameOf('/a/b/')).toBe('b');
  });
  it('returns empty for empty input', () => {
    expect(basenameOf('')).toBe('');
  });
  it('returns the input when no separator', () => {
    expect(basenameOf('only')).toBe('only');
  });
});

describe('dirnameOf', () => {
  it('returns parent of POSIX path', () => {
    expect(dirnameOf('/a/b/c.md')).toBe('/a/b');
  });
  it('returns parent of Windows path', () => {
    expect(dirnameOf('C:\\a\\b\\c.md')).toBe('C:\\a\\b');
  });
  it('returns empty for single-segment input', () => {
    expect(dirnameOf('only')).toBe('');
  });
});

describe('joinPath', () => {
  it('joins POSIX paths with /', () => {
    expect(joinPath('/a/b', 'c.md')).toBe('/a/b/c.md');
  });
  it('joins Windows paths with backslash', () => {
    expect(joinPath('C:\\a', 'b.md')).toBe('C:\\a\\b.md');
  });
  it('does not double the separator', () => {
    expect(joinPath('/a/', 'b')).toBe('/a/b');
  });
  it('handles empty parent or child', () => {
    expect(joinPath('', 'x')).toBe('x');
    expect(joinPath('/a', '')).toBe('/a');
  });
});

describe('isAncestor', () => {
  it('matches descendant POSIX paths', () => {
    expect(isAncestor('/notes', '/notes/sub/x.md')).toBe(true);
  });
  it('treats equal paths as ancestor of themselves', () => {
    expect(isAncestor('/notes', '/notes')).toBe(true);
  });
  it('rejects unrelated paths', () => {
    expect(isAncestor('/notes', '/notebook/x.md')).toBe(false);
  });
  it('handles Windows separators', () => {
    expect(isAncestor('C:\\notes', 'C:\\notes\\sub\\x.md')).toBe(true);
  });
  it('handles mixed separators', () => {
    expect(isAncestor('C:\\notes', 'C:/notes/sub/x.md')).toBe(true);
  });
  it('rejects empty inputs', () => {
    expect(isAncestor('', '/x')).toBe(false);
    expect(isAncestor('/x', '')).toBe(false);
  });
});

describe('pathSegments', () => {
  it('splits POSIX absolute', () => {
    expect(pathSegments('/a/b/c')).toEqual(['/', 'a', 'b', 'c']);
  });
  it('splits Windows path with drive', () => {
    expect(pathSegments('C:\\a\\b')).toEqual(['C:', 'a', 'b']);
  });
  it('splits relative path', () => {
    expect(pathSegments('rel/path/x')).toEqual(['rel', 'path', 'x']);
  });
  it('returns empty for empty input', () => {
    expect(pathSegments('')).toEqual([]);
  });
});

describe('ancestorsBetween', () => {
  it('returns folders between root and target parent', () => {
    expect(ancestorsBetween('/a', '/a/b/c/file.md')).toEqual(['/a/b', '/a/b/c']);
  });
  it('returns empty when target is direct child of root', () => {
    expect(ancestorsBetween('/a', '/a/file.md')).toEqual([]);
  });
  it('returns empty when target is not under root', () => {
    expect(ancestorsBetween('/x', '/y/file.md')).toEqual([]);
  });
  it('handles trailing root separator', () => {
    expect(ancestorsBetween('/a/', '/a/b/c/file.md')).toEqual(['/a/b', '/a/b/c']);
  });
});

describe('trimTrailingSep', () => {
  it('removes trailing slash', () => {
    expect(trimTrailingSep('/a/b/')).toBe('/a/b');
  });
  it('removes trailing backslash', () => {
    expect(trimTrailingSep('C:\\a\\')).toBe('C:\\a');
  });
  it('is a no-op without trailing separator', () => {
    expect(trimTrailingSep('/a')).toBe('/a');
  });
});
