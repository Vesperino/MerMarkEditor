import { describe, it, expect } from 'vitest';
import {
  toCssPoint,
  isPointInRect,
  acceptsFolderDrop,
  droppedFolders,
  droppedFiles,
} from '../../utils/folder-drop';

const sidebar = { left: 0, top: 32, right: 240, bottom: 800 };

describe('toCssPoint', () => {
  it('divides physical pixels by the device pixel ratio', () => {
    expect(toCssPoint({ x: 300, y: 150 }, 1.5)).toEqual({ x: 200, y: 100 });
  });

  it('falls back to 1 for a zero or invalid ratio', () => {
    expect(toCssPoint({ x: 10, y: 20 }, 0)).toEqual({ x: 10, y: 20 });
    expect(toCssPoint({ x: 10, y: 20 }, Number.NaN)).toEqual({ x: 10, y: 20 });
  });
});

describe('isPointInRect', () => {
  it('accepts points inside and on the edges', () => {
    expect(isPointInRect({ x: 10, y: 100 }, sidebar)).toBe(true);
    expect(isPointInRect({ x: 0, y: 32 }, sidebar)).toBe(true);
    expect(isPointInRect({ x: 240, y: 800 }, sidebar)).toBe(true);
  });

  it('rejects points outside', () => {
    expect(isPointInRect({ x: 241, y: 100 }, sidebar)).toBe(false);
    expect(isPointInRect({ x: 10, y: 31 }, sidebar)).toBe(false);
  });
});

describe('acceptsFolderDrop', () => {
  it('accepts anywhere when no sidebar rect is available (sidebar hidden)', () => {
    expect(acceptsFolderDrop({ x: 900, y: 500 }, null)).toBe(true);
  });

  it('accepts only inside the sidebar when the sidebar is visible', () => {
    expect(acceptsFolderDrop({ x: 100, y: 400 }, sidebar)).toBe(true);
    expect(acceptsFolderDrop({ x: 900, y: 400 }, sidebar)).toBe(false);
  });

  it('accepts when the drop carries no position', () => {
    expect(acceptsFolderDrop(null, sidebar)).toBe(true);
  });
});

describe('droppedFolders', () => {
  it('keeps only folders, in drop order', () => {
    const folders = droppedFolders([
      { path: '/a/note.md', kind: 'file' },
      { path: '/b', kind: 'folder' },
      { path: '/gone', kind: 'missing' },
      { path: '/a', kind: 'folder' },
    ]);
    expect(folders).toEqual(['/b', '/a']);
  });

  it('drops duplicates that differ only by separator style or trailing slash', () => {
    const folders = droppedFolders([
      { path: 'C:\\Notes', kind: 'folder' },
      { path: 'C:\\Notes\\', kind: 'folder' },
      { path: 'C:/Notes', kind: 'folder' },
    ]);
    expect(folders).toEqual(['C:\\Notes']);
  });

  it('returns an empty list for a file-only drop', () => {
    expect(droppedFolders([{ path: '/a/note.md', kind: 'file' }])).toEqual([]);
  });
});

describe('droppedFiles', () => {
  it('keeps only files', () => {
    expect(
      droppedFiles([
        { path: '/a/note.md', kind: 'file' },
        { path: '/b', kind: 'folder' },
        { path: '/gone', kind: 'missing' },
      ]),
    ).toEqual(['/a/note.md']);
  });
});
