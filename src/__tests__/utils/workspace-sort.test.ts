import { describe, it, expect } from 'vitest';
import {
  sortNodes,
  resolveSortMode,
  migrateSortMode,
  DEFAULT_SORT_MODE,
} from '../../utils/workspace-sort';
import type { WorkspaceNode } from '../../services/workspaceFs';

function file(name: string, modified = 0): WorkspaceNode {
  return { name, path: `/ws/${name}`, kind: 'file', modified };
}
function folder(name: string, modified = 0): WorkspaceNode {
  return { name, path: `/ws/${name}`, kind: 'folder', children: [], modified };
}

describe('sortNodes', () => {
  it('always groups folders before files', () => {
    const out = sortNodes([file('a.md'), folder('zeta'), file('b.md')], 'name-asc');
    expect(out.map((n) => n.kind)).toEqual(['folder', 'file', 'file']);
  });

  it('sorts name-asc case-insensitively within groups', () => {
    const out = sortNodes([file('Banana.md'), file('apple.md')], 'name-asc');
    expect(out.map((n) => n.name)).toEqual(['apple.md', 'Banana.md']);
  });

  it('sorts name-desc', () => {
    const out = sortNodes([file('apple.md'), file('banana.md')], 'name-desc');
    expect(out.map((n) => n.name)).toEqual(['banana.md', 'apple.md']);
  });

  it('sorts modified-desc (newest first) with name tie-break', () => {
    const out = sortNodes([file('old.md', 100), file('new.md', 300), file('mid.md', 200)], 'modified-desc');
    expect(out.map((n) => n.name)).toEqual(['new.md', 'mid.md', 'old.md']);
  });

  it('sorts modified-asc (oldest first)', () => {
    const out = sortNodes([file('new.md', 300), file('old.md', 100)], 'modified-asc');
    expect(out.map((n) => n.name)).toEqual(['old.md', 'new.md']);
  });

  it('does not mutate the input array', () => {
    const input = [file('b.md'), file('a.md')];
    const copy = [...input];
    sortNodes(input, 'name-asc');
    expect(input).toEqual(copy);
  });

  it('falls back to default mode for an unknown mode', () => {
    const out = sortNodes([file('b.md'), file('a.md')], 'garbage' as never);
    expect(out.map((n) => n.name)).toEqual(['a.md', 'b.md']);
  });
});

describe('resolveSortMode', () => {
  const base = {
    folderOverrides: {} as Record<string, never>,
    workspaceOverrides: {} as Record<string, never>,
    globalMode: 'name-asc' as const,
  };

  it('uses the global mode when nothing is overridden', () => {
    expect(resolveSortMode({ ...base, folderPath: '/ws/x', workspaceId: 'w1' })).toBe('name-asc');
  });

  it('prefers the workspace override over global', () => {
    expect(
      resolveSortMode({
        ...base,
        workspaceId: 'w1',
        workspaceOverrides: { w1: 'modified-desc' },
      }),
    ).toBe('modified-desc');
  });

  it('prefers the folder override over workspace and global', () => {
    expect(
      resolveSortMode({
        ...base,
        folderPath: '/ws/sub',
        workspaceId: 'w1',
        workspaceOverrides: { w1: 'modified-desc' },
        folderOverrides: { '/ws/sub': 'name-desc' },
      }),
    ).toBe('name-desc');
  });

  it('cascades a folder override down to a subfolder (nearest ancestor wins)', () => {
    expect(
      resolveSortMode({
        ...base,
        folderPath: '/ws/a/b/c',
        workspaceId: 'w1',
        folderOverrides: { '/ws/a': 'modified-desc' },
      }),
    ).toBe('modified-desc');
  });

  it('a deeper folder override beats a shallower ancestor override', () => {
    expect(
      resolveSortMode({
        ...base,
        folderPath: '/ws/a/b/c',
        workspaceId: 'w1',
        folderOverrides: { '/ws/a': 'modified-desc', '/ws/a/b': 'name-desc' },
      }),
    ).toBe('name-desc');
  });

  it('handles Windows backslash paths when cascading', () => {
    expect(
      resolveSortMode({
        ...base,
        folderPath: 'C:\\ws\\a\\b',
        folderOverrides: { 'C:\\ws\\a': 'modified-asc' },
      }),
    ).toBe('modified-asc');
  });
});

describe('migrateSortMode', () => {
  it('maps legacy "name" to name-asc', () => {
    expect(migrateSortMode('name')).toBe('name-asc');
  });
  it('maps legacy "modified" to modified-desc', () => {
    expect(migrateSortMode('modified')).toBe('modified-desc');
  });
  it('passes through a valid new mode', () => {
    expect(migrateSortMode('name-desc')).toBe('name-desc');
  });
  it('falls back to default for unknown/empty', () => {
    expect(migrateSortMode(undefined)).toBe(DEFAULT_SORT_MODE);
    expect(migrateSortMode('weird')).toBe(DEFAULT_SORT_MODE);
  });
});
