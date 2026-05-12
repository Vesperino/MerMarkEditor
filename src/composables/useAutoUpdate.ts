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
  isCheckingForUpdates: ReturnType<typeof ref<boolean>>;
  noUpdateFound: ReturnType<typeof ref<boolean>>;
  checkForUpdates: () => Promise<void>;
  checkForUpdatesManual: () => Promise<void>;
  downloadAndInstallUpdate: () => Promise<void>;
  closeUpdateDialog: () => void;
}

const DISMISSED_KEY = 'mermark-dismissed-update-version';
const GITHUB_REPO = 'Vesperino/MerMarkEditor';

// Module-level singletons so App.vue and SettingsModal share the same state.
const showUpdateDialog = ref(false);
const updateInfo = ref<UpdateInfo | null>(null);
const updateProgress = ref(0);
const isUpdating = ref(false);
const updateError = ref<string | null>(null);
const isCheckingForUpdates = ref(false);
const noUpdateFound = ref(false);

/** Fetch release notes from GitHub API as fallback when Tauri updater body is empty. */
async function fetchGitHubReleaseNotes(version: string): Promise<string> {
  const tag = version.startsWith('v') ? version : `v${version}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tag}`);
    if (!res.ok) return '';
    const data = await res.json();
    return typeof data?.body === 'string' ? data.body : '';
  } catch {
    return '';
  }
}

async function runCheck(ignoreDismissed: boolean): Promise<void> {
  noUpdateFound.value = false;
  isCheckingForUpdates.value = true;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (!update) {
      if (ignoreDismissed) noUpdateFound.value = true;
      return;
    }

    // Skip if user already dismissed this exact version (automatic check only)
    if (!ignoreDismissed && localStorage.getItem(DISMISSED_KEY) === update.version) return;

    // Prefer Tauri updater body; fall back to GitHub Releases API
    let notes = update.body || '';
    if (!notes.trim()) {
      notes = await fetchGitHubReleaseNotes(update.version);
    }

    updateInfo.value = { version: update.version, notes };
    showUpdateDialog.value = true;
  } catch (error) {
    console.log('Update check skipped:', error);
    if (ignoreDismissed) noUpdateFound.value = true;
  } finally {
    isCheckingForUpdates.value = false;
  }
}

export function useAutoUpdate(): UseAutoUpdateReturn {
  const checkForUpdates = (): Promise<void> => runCheck(false);
  const checkForUpdatesManual = (): Promise<void> => runCheck(true);

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

        // Clear dismissal on successful install + relaunch
        localStorage.removeItem(DISMISSED_KEY);
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      }
    } catch (error) {
      updateError.value = error instanceof Error ? error.message : 'Błąd podczas aktualizacji';
      isUpdating.value = false;
    }
  };

  const closeUpdateDialog = (): void => {
    if (isUpdating.value) return;
    // Persist dismissal so the dialog doesn't reappear for this version
    if (updateInfo.value?.version) {
      localStorage.setItem(DISMISSED_KEY, updateInfo.value.version);
    }
    showUpdateDialog.value = false;
    updateInfo.value = null;
    updateError.value = null;
  };

  return {
    showUpdateDialog,
    updateInfo,
    updateProgress,
    isUpdating,
    updateError,
    isCheckingForUpdates,
    noUpdateFound,
    checkForUpdates,
    checkForUpdatesManual,
    downloadAndInstallUpdate,
    closeUpdateDialog,
  };
}
