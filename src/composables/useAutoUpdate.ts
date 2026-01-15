import { ref } from 'vue';

export interface UpdateInfo {
  version: string;
  notes: string;
}

export interface UseAutoUpdateReturn {
  showUpdateDialog: ReturnType<typeof ref<boolean>>;
  updateInfo: ReturnType<typeof ref<UpdateInfo | null>>;
  updateProgress: ReturnType<typeof ref<number>>;
  isUpdating: ReturnType<typeof ref<boolean>>;
  updateError: ReturnType<typeof ref<string | null>>;
  checkForUpdates: () => Promise<void>;
  downloadAndInstallUpdate: () => Promise<void>;
  closeUpdateDialog: () => void;
}

export function useAutoUpdate(): UseAutoUpdateReturn {
  const showUpdateDialog = ref(false);
  const updateInfo = ref<UpdateInfo | null>(null);
  const updateProgress = ref(0);
  const isUpdating = ref(false);
  const updateError = ref<string | null>(null);

  const checkForUpdates = async (): Promise<void> => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        updateInfo.value = {
          version: update.version,
          notes: update.body || '',
        };
        showUpdateDialog.value = true;
      }
    } catch (error) {
      // Silently fail if update check fails (might not have endpoints configured)
      console.log('Sprawdzanie aktualizacji pominięte:', error);
    }
  };

  const downloadAndInstallUpdate = async (): Promise<void> => {
    try {
      isUpdating.value = true;
      updateError.value = null;
      updateProgress.value = 0;

      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        await update.downloadAndInstall((progress) => {
          if (progress.event === 'Started') {
            updateProgress.value = 0;
          } else if (progress.event === 'Progress') {
            // Calculate actual percentage based on content length if available
            const progressData = progress.data as { chunkLength?: number; contentLength?: number };
            if (progressData.contentLength && progressData.contentLength > 0) {
              const currentProgress = updateProgress.value * progressData.contentLength / 100;
              const newProgress = ((currentProgress + (progressData.chunkLength || 0)) / progressData.contentLength) * 100;
              updateProgress.value = Math.min(99, Math.round(newProgress));
            } else {
              updateProgress.value = Math.min(99, updateProgress.value + 1);
            }
          } else if (progress.event === 'Finished') {
            updateProgress.value = 100;
          }
        });

        // Restart the app after update
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      }
    } catch (error) {
      updateError.value = error instanceof Error ? error.message : 'Błąd podczas aktualizacji';
      isUpdating.value = false;
    }
  };

  const closeUpdateDialog = (): void => {
    if (!isUpdating.value) {
      showUpdateDialog.value = false;
      updateInfo.value = null;
      updateError.value = null;
    }
  };

  return {
    showUpdateDialog,
    updateInfo,
    updateProgress,
    isUpdating,
    updateError,
    checkForUpdates,
    downloadAndInstallUpdate,
    closeUpdateDialog,
  };
}
