import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface TabTransferPayload {
  file_path: string;
  source_window: string;
  target_window: string;
}

export function useWindowManager() {
  const createNewWindow = async (filePath?: string | null): Promise<string> => {
    return invoke<string>('create_new_window', {
      filePath: filePath || null,
    });
  };

  const getFilePathFromUrl = (): string | null => {
    const urlParams = new URLSearchParams(window.location.search);
    const filePath = urlParams.get('file');
    return filePath ? decodeURIComponent(filePath) : null;
  };

  const getAllWindows = async (): Promise<string[]> => {
    return invoke<string[]>('get_all_windows');
  };

  const getCurrentWindowLabel = async (): Promise<string> => {
    return invoke<string>('get_current_window_label');
  };

  const transferTabToWindow = async (
    filePath: string,
    sourceWindow: string,
    targetWindow: string
  ): Promise<void> => {
    return invoke('transfer_tab_to_window', {
      filePath,
      sourceWindow,
      targetWindow,
    });
  };

  const onTabTransfer = async (
    callback: (payload: TabTransferPayload) => void
  ): Promise<UnlistenFn> => {
    return listen<TabTransferPayload>('tab-transfer', (event) => {
      callback(event.payload);
    });
  };

  const closeCurrentWindow = async (): Promise<void> => {
    const window = getCurrentWindow();
    await window.close();
  };

  // File registry functions
  const registerOpenFile = async (filePath: string, windowLabel: string): Promise<void> => {
    return invoke('register_open_file', { filePath, windowLabel });
  };

  const unregisterOpenFile = async (filePath: string): Promise<void> => {
    return invoke('unregister_open_file', { filePath });
  };

  const unregisterWindowFiles = async (windowLabel: string): Promise<void> => {
    return invoke('unregister_window_files', { windowLabel });
  };

  const checkFileOpen = async (filePath: string): Promise<string | null> => {
    return invoke<string | null>('check_file_open', { filePath });
  };

  const focusWindowWithFile = async (filePath: string): Promise<boolean> => {
    return invoke<boolean>('focus_window_with_file', { filePath });
  };

  const onFocusFile = async (
    callback: (filePath: string) => void
  ): Promise<UnlistenFn> => {
    return listen<string>('focus-file', (event) => {
      callback(event.payload);
    });
  };

  return {
    createNewWindow,
    getFilePathFromUrl,
    getAllWindows,
    getCurrentWindowLabel,
    transferTabToWindow,
    onTabTransfer,
    closeCurrentWindow,
    // File registry
    registerOpenFile,
    unregisterOpenFile,
    unregisterWindowFiles,
    checkFileOpen,
    focusWindowWithFile,
    onFocusFile,
  };
}
