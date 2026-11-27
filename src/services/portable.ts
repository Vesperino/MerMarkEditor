import { invoke } from '@tauri-apps/api/core';

export async function isPortable(): Promise<boolean> {
  try {
    return await invoke<boolean>('is_portable');
  } catch {
    return false;
  }
}
