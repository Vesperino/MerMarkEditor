import { ref } from 'vue';

const STORAGE_KEY = 'mermark-recent-files';
const MAX_RECENT_FILES = 10;

export interface RecentFile {
  filePath: string;
  fileName: string;
  openedAt: number;
}

function loadRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentFile[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_FILES) : [];
  } catch {
    return [];
  }
}

function saveRecentFiles(files: RecentFile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files.slice(0, MAX_RECENT_FILES)));
}

const recentFiles = ref<RecentFile[]>(loadRecentFiles());

export function useRecentFiles() {
  const addRecentFile = (filePath: string, fileName: string): void => {
    const filtered = recentFiles.value.filter(f => f.filePath !== filePath);
    filtered.unshift({ filePath, fileName, openedAt: Date.now() });
    recentFiles.value = filtered.slice(0, MAX_RECENT_FILES);
    saveRecentFiles(recentFiles.value);
  };

  const clearRecentFiles = (): void => {
    recentFiles.value = [];
    saveRecentFiles([]);
  };

  return {
    recentFiles,
    addRecentFile,
    clearRecentFiles,
  };
}
