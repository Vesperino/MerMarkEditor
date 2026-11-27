import { invoke } from '@tauri-apps/api/core';

export interface GitContext {
  repoRoot: string;
  currentBranch: string;
  branches: string[];
  trackingBranch: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
  operationInProgress: boolean;
}

export interface GitSyncResult {
  state: GitContext;
  fetched: boolean;
  pulled: boolean;
  message: string;
}

export const gitClient = {
  getContext: (path: string): Promise<GitContext | null> =>
    invoke<GitContext | null>('git_get_context', { path }),

  checkoutBranch: (path: string, branch: string): Promise<GitContext> =>
    invoke<GitContext>('git_checkout_branch', { path, branch }),

  sync: (path: string, autoPull: boolean, allowPull: boolean): Promise<GitSyncResult> =>
    invoke<GitSyncResult>('git_sync', { path, autoPull, allowPull }),

  commitAndPush: (path: string, message: string): Promise<GitContext> =>
    invoke<GitContext>('git_commit_and_push', { path, message }),
};
