import type { WorkspaceNode } from '../services/workspaceFs';

/**
 * Sort orders offered for the workspace tree. Folders are always grouped
 * before files; the mode only decides the order *within* each group.
 */
export type WorkspaceSortMode = 'name-asc' | 'name-desc' | 'modified-desc' | 'modified-asc';

export const DEFAULT_SORT_MODE: WorkspaceSortMode = 'name-asc';

export const SORT_MODES: WorkspaceSortMode[] = [
  'name-asc',
  'name-desc',
  'modified-desc',
  'modified-asc',
];

function byNameAsc(a: WorkspaceNode, b: WorkspaceNode): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

const COMPARATORS: Record<WorkspaceSortMode, (a: WorkspaceNode, b: WorkspaceNode) => number> = {
  'name-asc': byNameAsc,
  'name-desc': (a, b) => byNameAsc(b, a),
  // Newest first; tie-break by name so order is stable for equal mtimes.
  'modified-desc': (a, b) => (b.modified ?? 0) - (a.modified ?? 0) || byNameAsc(a, b),
  'modified-asc': (a, b) => (a.modified ?? 0) - (b.modified ?? 0) || byNameAsc(a, b),
};

/**
 * Returns a new array with folders first, then files, each group ordered by
 * `mode`. Never mutates the input (the cached tree must stay untouched).
 */
export function sortNodes(children: WorkspaceNode[], mode: WorkspaceSortMode): WorkspaceNode[] {
  const cmp = COMPARATORS[mode] ?? COMPARATORS[DEFAULT_SORT_MODE];
  const folders = children.filter((c) => c.kind === 'folder').sort(cmp);
  const files = children.filter((c) => c.kind === 'file').sort(cmp);
  return [...folders, ...files];
}

export interface SortResolution {
  folderPath?: string | null;
  workspaceId?: string | null;
  folderOverrides: Record<string, WorkspaceSortMode>;
  workspaceOverrides: Record<string, WorkspaceSortMode>;
  globalMode: WorkspaceSortMode;
}

/**
 * Resolves the effective sort mode for a folder's children, most specific
 * wins: explicit folder override → owning workspace override → global default.
 */
export function resolveSortMode(opts: SortResolution): WorkspaceSortMode {
  const { folderPath, workspaceId, folderOverrides, workspaceOverrides, globalMode } = opts;
  if (folderPath && folderOverrides[folderPath]) return folderOverrides[folderPath];
  if (workspaceId && workspaceOverrides[workspaceId]) return workspaceOverrides[workspaceId];
  return globalMode;
}

/**
 * Maps the legacy two-value setting ('name' | 'modified') onto the richer
 * mode set so saved preferences survive the upgrade.
 */
export function migrateSortMode(legacy: string | undefined | null): WorkspaceSortMode {
  if (legacy === 'modified') return 'modified-desc';
  if (legacy && (SORT_MODES as string[]).includes(legacy)) return legacy as WorkspaceSortMode;
  return DEFAULT_SORT_MODE;
}
