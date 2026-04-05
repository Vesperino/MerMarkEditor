import { type Ref, watch } from 'vue';
import type { SplitViewState } from '../types/pane';

const STORAGE_KEY = 'mermark-session';
const SAVE_DEBOUNCE_MS = 1000;

export interface SessionTabData {
  filePath: string;
  fileName: string;
}

export interface SessionData {
  activePaneId: string;
  panes: {
    id: string;
    activeTabId: string;
    tabs: SessionTabData[];
  }[];
}

function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionData;
    if (!parsed.panes || !Array.isArray(parsed.panes)) return null;
    // Only restore if there are actual file tabs
    const hasFiles = parsed.panes.some(p => p.tabs.some(t => t.filePath));
    return hasFiles ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(state: SplitViewState): void {
  const sessionData: SessionData = {
    activePaneId: state.activePaneId,
    panes: state.panes.map(pane => ({
      id: pane.id,
      activeTabId: pane.activeTabId,
      tabs: pane.tabs
        .filter(tab => tab.filePath)
        .map(tab => ({
          filePath: tab.filePath!,
          fileName: tab.fileName,
        })),
    })).filter(p => p.tabs.length > 0),
  };

  if (sessionData.panes.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
}

export function useSessionRestore(splitState: Ref<SplitViewState>) {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const getSavedSession = (): SessionData | null => {
    return loadSession();
  };

  const clearSession = (): void => {
    localStorage.removeItem(STORAGE_KEY);
  };

  const startWatching = (): void => {
    watch(
      () => {
        const s = splitState.value;
        return {
          panes: s.panes.map(p => ({
            id: p.id,
            activeTabId: p.activeTabId,
            tabs: p.tabs.map(t => ({ filePath: t.filePath, fileName: t.fileName })),
          })),
          activePaneId: s.activePaneId,
        };
      },
      () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveSession(splitState.value), SAVE_DEBOUNCE_MS);
      },
      { deep: true },
    );
  };

  return {
    getSavedSession,
    clearSession,
    startWatching,
  };
}
