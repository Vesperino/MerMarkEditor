/**
 * Thin wrapper around the Tauri workspace filesystem commands.
 *
 * Keeping these in one place makes them mockable from tests and gives
 * `useWorkspace` a clear seam — the composable orchestrates state, this
 * module is the only place that knows about IPC.
 */

import { invoke } from '@tauri-apps/api/core';

export interface WorkspaceNode {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  children?: WorkspaceNode[];
}

export interface ContentSearchHit {
  /** Absolute path of the file containing the hit. */
  path: string;
  /** 1-based line number of the matching line. */
  line: number;
  /** Trimmed and length-capped match line for UI display. */
  snippet: string;
}

export const workspaceFs = {
  /** Read the full markdown-only tree rooted at `root`. May be slow for large folders. */
  readTree: (root: string): Promise<WorkspaceNode> =>
    invoke<WorkspaceNode>('read_workspace_tree', { root }),

  /** Create an empty .md file under `parent`. Auto-appends `.md` if missing. */
  createFile: (parent: string, name: string): Promise<string> =>
    invoke<string>('create_md_file', { parent, name }),

  /** Move/rename a file or folder. */
  rename: (from: string, to: string): Promise<void> =>
    invoke<void>('rename_path', { from, to }),

  /** Delete a file or recursively a folder. */
  remove: (path: string): Promise<void> =>
    invoke<void>('delete_path', { path }),

  /** Reveal a file/folder in the host OS file manager. */
  reveal: (path: string): Promise<void> =>
    invoke<void>('reveal_in_os', { path }),

  /**
   * Substring-search the markdown contents of every file under any of `roots`.
   * Case-insensitive. Backend caps the work (5k files, 4 s budget) so the
   * caller only needs to debounce typing — there's no full-disk-walk failure
   * mode for the UI to defend against.
   */
  searchContent: (roots: string[], query: string): Promise<ContentSearchHit[]> =>
    invoke<ContentSearchHit[]>('search_workspace_content', { roots, query }),
};
