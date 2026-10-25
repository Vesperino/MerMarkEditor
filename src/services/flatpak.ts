import { invoke } from '@tauri-apps/api/core';

export async function isFlatpak(): Promise<boolean> {
  try {
    return await invoke<boolean>('is_flatpak');
  } catch {
    return false;
  }
}
