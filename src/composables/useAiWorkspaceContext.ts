import type { AccessMap } from '../services/aiCommands';

/**
 * Pure helpers that fold workspace context into AI requests.
 *
 * The model is bound to a *single main file* per chat (`docPath`), but when
 * that file lives inside an open workspace we want the assistant to be able
 * to *read* the surrounding files for context. Writes still target only the
 * active doc — the workspace is reference material, not a free-for-all.
 */

/**
 * Returns a copy of `accessMap` with the workspace root added to `readPaths`
 * (deduplicated). When `workspaceRoot` is empty, the input is returned
 * unchanged. `writePaths` is never modified — the active file remains the
 * only writable target.
 */
export function withWorkspaceReadAccess(
  accessMap: AccessMap | null,
  workspaceRoot: string,
): AccessMap | null {
  if (!accessMap) return accessMap;
  if (!workspaceRoot) return accessMap;
  if (accessMap.readPaths.includes(workspaceRoot)) return accessMap;
  return {
    ...accessMap,
    readPaths: [...accessMap.readPaths, workspaceRoot],
  };
}
