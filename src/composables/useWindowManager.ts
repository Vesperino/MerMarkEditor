import { invoke } from '@tauri-apps/api/core';

/**
 * Composable for managing multi-window operations
 */
export function useWindowManager() {
  /**
   * Create a new window with an optional file path
   * @param filePath - Optional file path to open in the new window
   * @returns Promise with the new window label
   */
  const createNewWindow = async (filePath?: string | null): Promise<string> => {
    try {
      const windowLabel = await invoke<string>('create_new_window', {
        filePath: filePath || null,
      });
      return windowLabel;
    } catch (error) {
      console.error('Error creating new window:', error);
      throw error;
    }
  };

  /**
   * Get file path from URL query parameters (for new windows)
   * @returns The file path from URL or null
   */
  const getFilePathFromUrl = (): string | null => {
    const urlParams = new URLSearchParams(window.location.search);
    const filePath = urlParams.get('file');
    if (filePath) {
      return decodeURIComponent(filePath);
    }
    return null;
  };

  return {
    createNewWindow,
    getFilePathFromUrl,
  };
}
