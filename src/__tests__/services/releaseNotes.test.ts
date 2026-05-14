import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  parseEntry,
  selectCurrent,
  sortEntriesDesc,
  type ReleaseEntry,
} from '../../services/releaseNotes';

describe('compareVersions', () => {
  it('orders by major', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
  });
  it('orders by minor when major equal', () => {
    expect(compareVersions('0.3.0', '0.2.99')).toBeGreaterThan(0);
  });
  it('orders by patch when major and minor equal', () => {
    expect(compareVersions('0.2.12', '0.2.9')).toBeGreaterThan(0);
  });
  it('returns 0 for identical versions', () => {
    expect(compareVersions('0.2.12', '0.2.12')).toBe(0);
  });
});

describe('parseEntry', () => {
  it('extracts version and title from filename + first H1', () => {
    const md = '# Release v0.2.12 — PDF fixes\n\nDetails.';
    const entry = parseEntry('../../docs/release-notes/v0.2.12/RELEASE_NOTES.md', md);
    expect(entry).not.toBeNull();
    expect(entry!.version).toBe('0.2.12');
    expect(entry!.tag).toBe('v0.2.12');
    expect(entry!.title).toBe('PDF fixes');
    expect(entry!.markdown).toBe(md);
  });

  it('returns null when the path is not a vX.Y.Z folder', () => {
    expect(parseEntry('../../docs/release-notes/screenshots/RELEASE_NOTES.md', '# whatever')).toBeNull();
  });

  it('falls back to the version when the heading has no em-dash title', () => {
    const md = '# Release v0.2.0\n\nDetails.';
    const entry = parseEntry('../../docs/release-notes/v0.2.0/RELEASE_NOTES.md', md);
    expect(entry!.title).toBe('v0.2.0');
  });
});

describe('sortEntriesDesc', () => {
  it('sorts the newest version first', () => {
    const entries: ReleaseEntry[] = [
      { version: '0.2.6', tag: 'v0.2.6', title: 'A', markdown: '' },
      { version: '0.2.12', tag: 'v0.2.12', title: 'B', markdown: '' },
      { version: '0.2.8', tag: 'v0.2.8', title: 'C', markdown: '' },
    ];
    expect(sortEntriesDesc(entries).map((e) => e.version)).toEqual([
      '0.2.12',
      '0.2.8',
      '0.2.6',
    ]);
  });
});

describe('selectCurrent', () => {
  const entries: ReleaseEntry[] = [
    { version: '0.2.13', tag: 'v0.2.13', title: 'B', markdown: '' },
    { version: '0.2.12', tag: 'v0.2.12', title: 'A', markdown: '' },
  ];

  it('returns the matching entry when the version is on disk', () => {
    expect(selectCurrent(entries, '0.2.12')?.version).toBe('0.2.12');
  });

  it('returns null when no entry matches', () => {
    expect(selectCurrent(entries, '9.9.9')).toBeNull();
  });
});
