import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

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

  return {
    createNewWindow,
    getFilePathFromUrl,
    getAllWindows,
    getCurrentWindowLabel,
    transferTabToWindow,
    onTabTransfer,
  };
}
