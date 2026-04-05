import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { useSessionRestore, type SessionData } from '../../composables/useSessionRestore';
import type { SplitViewState } from '../../types/pane';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

function createSplitState(tabs: { filePath: string | null; fileName: string }[] = []): ReturnType<typeof ref<SplitViewState>> {
  return ref<SplitViewState>({
    panes: [{
      id: 'left',
      activeTabId: 'tab-1',
      scrollTop: 0,
      tabs: tabs.map((t, i) => ({
        id: `tab-${i + 1}`,
        filePath: t.filePath,
        fileName: t.fileName,
        content: '<p></p>',
        hasChanges: false,
        scrollTop: 0,
        originalMarkdown: null,
      })),
    }],
    activePaneId: 'left',
    isSplitActive: false,
    splitRatio: 0.5,
  });
}

describe('useSessionRestore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should return null when no session is saved', () => {
    const state = createSplitState();
    const { getSavedSession } = useSessionRestore(state);
    expect(getSavedSession()).toBeNull();
  });

  it('should return saved session data', () => {
    const session: SessionData = {
      activePaneId: 'left',
      panes: [{
        id: 'left',
        activeTabId: 'tab-1',
        tabs: [{ filePath: '/test/file.md', fileName: 'file.md' }],
      }],
    };
    localStorageMock.setItem('mermark-session', JSON.stringify(session));

    const state = createSplitState();
    const { getSavedSession } = useSessionRestore(state);
    const result = getSavedSession();
    expect(result).not.toBeNull();
    expect(result!.panes[0].tabs[0].filePath).toBe('/test/file.md');
  });

  it('should return null for session with no file tabs', () => {
    const session: SessionData = {
      activePaneId: 'left',
      panes: [{
        id: 'left',
        activeTabId: 'tab-1',
        tabs: [],
      }],
    };
    localStorageMock.setItem('mermark-session', JSON.stringify(session));

    const state = createSplitState();
    const { getSavedSession } = useSessionRestore(state);
    expect(getSavedSession()).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    localStorageMock.setItem('mermark-session', 'not-json');

    const state = createSplitState();
    const { getSavedSession } = useSessionRestore(state);
    expect(getSavedSession()).toBeNull();
  });

  it('should clear session from localStorage', () => {
    localStorageMock.setItem('mermark-session', '{}');

    const state = createSplitState();
    const { clearSession } = useSessionRestore(state);
    clearSession();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('mermark-session');
  });
});
