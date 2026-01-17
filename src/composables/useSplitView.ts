import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import type { Tab } from './useTabs';
import {
  type Pane,
  type SplitViewState,
  type TabMovePayload,
  createDefaultSplitViewState,
} from '../types/pane';

const STORAGE_KEY = 'mermark-split-view';
const MIN_SPLIT_RATIO = 0.2;
const MAX_SPLIT_RATIO = 0.8;

function loadSplitViewState(): SplitViewState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const defaultState = createDefaultSplitViewState();
      return {
        ...defaultState,
        splitRatio: parsed.splitRatio ?? 0.5,
      };
    }
  } catch (error) {
    console.error('Error loading split view state:', error);
  }
  return createDefaultSplitViewState();
}

function saveSplitViewPreferences(state: SplitViewState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      splitRatio: state.splitRatio,
    }));
  } catch (error) {
    console.error('Error saving split view state:', error);
  }
}

const splitState = ref<SplitViewState>(loadSplitViewState());
let tabCounter = 1;

watch(() => splitState.value.splitRatio, () => {
  saveSplitViewPreferences(splitState.value);
});

export interface UseSplitViewReturn {
  /** Full split view state */
  splitState: Ref<SplitViewState>;
  /** ID of the currently active pane */
  activePaneId: ComputedRef<string>;
  /** The currently active pane object */
  activePane: ComputedRef<Pane>;
  /** Whether split view is currently enabled */
  isSplitActive: ComputedRef<boolean>;
  /** The left pane */
  leftPane: ComputedRef<Pane>;
  /** The right pane (undefined if split not active) */
  rightPane: ComputedRef<Pane | undefined>;
  /** Current split ratio (0.0-1.0) */
  splitRatio: ComputedRef<number>;

  // Pane Actions
  enableSplit: () => void;
  disableSplit: () => void;
  toggleSplit: () => void;
  setActivePane: (paneId: string) => void;
  setSplitRatio: (ratio: number) => void;

  // Tab Actions (within pane)
  createTab: (paneId: string, filePath?: string | null, content?: string, fileName?: string) => string;
  closeTab: (paneId: string, tabId: string, autoCreateNew?: boolean) => void;
  removeTabWithoutCreate: (paneId: string, tabId: string) => void;
  isWindowEmpty: () => boolean;
  switchTab: (paneId: string, tabId: string) => void;
  updateTabContent: (paneId: string, tabId: string, content: string) => void;
  updateTabChanges: (paneId: string, tabId: string, hasChanges: boolean) => void;
  saveTabScrollPosition: (paneId: string, scrollTop: number) => void;
  findTabByFilePath: (filePath: string) => { pane: Pane; tab: Tab } | undefined;

  // Cross-pane Actions
  moveTabBetweenPanes: (payload: TabMovePayload) => void;
  reorderTabWithinPane: (paneId: string, tabId: string, newIndex: number) => void;

  // Utility
  getActiveTabForPane: (paneId: string) => Tab | undefined;
  getAllUnsavedTabs: () => Array<{ paneId: string; tab: Tab }>;
}

export function useSplitView(): UseSplitViewReturn {
  const activePaneId = computed(() => splitState.value.activePaneId);

  const activePane = computed(() => {
    const pane = splitState.value.panes.find(p => p.id === splitState.value.activePaneId);
    return pane || splitState.value.panes[0];
  });

  const isSplitActive = computed(() => splitState.value.isSplitActive);
  const leftPane = computed(() => splitState.value.panes[0]);
  const rightPane = computed(() =>
    splitState.value.isSplitActive ? splitState.value.panes[1] : undefined
  );
  const splitRatio = computed(() => splitState.value.splitRatio);

  const findPane = (paneId: string): Pane | undefined => {
    return splitState.value.panes.find(p => p.id === paneId);
  };

  const generateTabId = (paneId: string): string => {
    tabCounter++;
    return `${paneId}-tab-${tabCounter}`;
  };

  const enableSplit = (): void => {
    if (splitState.value.isSplitActive) return;

    const rightPane: Pane = {
      id: 'right',
      tabs: [],
      activeTabId: '',
      scrollTop: 0,
    };
    splitState.value.panes.push(rightPane);
    splitState.value.isSplitActive = true;
  };

  const disableSplit = (): void => {
    if (!splitState.value.isSplitActive) return;

    const right = splitState.value.panes[1];
    if (right) {
      const left = splitState.value.panes[0];
      left.tabs.push(...right.tabs);
    }

    splitState.value.panes = [splitState.value.panes[0]];
    splitState.value.isSplitActive = false;
    splitState.value.activePaneId = 'left';
  };

  const toggleSplit = (): void => {
    if (splitState.value.isSplitActive) {
      disableSplit();
    } else {
      enableSplit();
    }
  };

  const setActivePane = (paneId: string): void => {
    const pane = findPane(paneId);
    if (pane) {
      splitState.value.activePaneId = paneId;
    }
  };

  const setSplitRatio = (ratio: number): void => {
    splitState.value.splitRatio = Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio));
  };

  const getDefaultFileName = (): string => {
    const lang = navigator.language || 'pl';
    return lang.startsWith('pl') ? 'Nowy dokument' : 'New Document';
  };

  const createTab = (
    paneId: string,
    filePath: string | null = null,
    content: string = '<p></p>',
    fileName?: string
  ): string => {
    const actualFileName = fileName ?? getDefaultFileName();
    const pane = findPane(paneId);
    if (!pane) return '';

    const tabId = generateTabId(paneId);
    const newTab: Tab = {
      id: tabId,
      filePath,
      fileName: actualFileName,
      content,
      hasChanges: false,
      scrollTop: 0,
    };

    pane.tabs.push(newTab);
    pane.activeTabId = tabId;

    return tabId;
  };

  const closeTab = (paneId: string, tabId: string, autoCreateNew: boolean = false): void => {
    const pane = findPane(paneId);
    if (!pane) return;

    const tabIndex = pane.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    pane.tabs.splice(tabIndex, 1);

    if (pane.activeTabId === tabId) {
      if (pane.tabs.length > 0) {
        const newIndex = Math.max(0, tabIndex - 1);
        pane.activeTabId = pane.tabs[newIndex].id;
      } else if (autoCreateNew) {
        createTab(paneId);
      }
    }
  };

  const removeTabWithoutCreate = (paneId: string, tabId: string): void => {
    const pane = findPane(paneId);
    if (!pane) return;

    const tabIndex = pane.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    pane.tabs.splice(tabIndex, 1);

    if (pane.activeTabId === tabId && pane.tabs.length > 0) {
      const newIndex = Math.max(0, tabIndex - 1);
      pane.activeTabId = pane.tabs[newIndex].id;
    }
  };

  const isWindowEmpty = (): boolean => {
    return splitState.value.panes.every(pane => pane.tabs.length === 0);
  };

  const switchTab = (paneId: string, tabId: string): void => {
    const pane = findPane(paneId);
    if (!pane) return;

    const tab = pane.tabs.find(t => t.id === tabId);
    if (tab) {
      pane.activeTabId = tabId;
    }
  };

  const updateTabContent = (paneId: string, tabId: string, content: string): void => {
    const pane = findPane(paneId);
    if (!pane) return;

    const tab = pane.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.content = content;
    }
  };

  const updateTabChanges = (paneId: string, tabId: string, hasChanges: boolean): void => {
    const pane = findPane(paneId);
    if (!pane) return;

    const tab = pane.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.hasChanges = hasChanges;
    }
  };

  const saveTabScrollPosition = (paneId: string, scrollTop: number): void => {
    const pane = findPane(paneId);
    if (pane) {
      pane.scrollTop = scrollTop;
    }
  };

  const findTabByFilePath = (filePath: string): { pane: Pane; tab: Tab } | undefined => {
    for (const pane of splitState.value.panes) {
      const tab = pane.tabs.find(t => t.filePath === filePath);
      if (tab) {
        return { pane, tab };
      }
    }
    return undefined;
  };

  const moveTabBetweenPanes = (payload: TabMovePayload): void => {
    const { tabId, sourcePaneId, targetPaneId, targetIndex } = payload;

    const sourcePane = findPane(sourcePaneId);
    const targetPane = findPane(targetPaneId);

    if (!sourcePane || !targetPane) return;
    if (sourcePaneId === targetPaneId) return;

    const tabIndex = sourcePane.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const [tab] = sourcePane.tabs.splice(tabIndex, 1);

    if (targetIndex !== undefined && targetIndex >= 0) {
      targetPane.tabs.splice(targetIndex, 0, tab);
    } else {
      targetPane.tabs.push(tab);
    }

    targetPane.activeTabId = tab.id;

    if (sourcePane.tabs.length === 0) {
      if (splitState.value.isSplitActive) {
        splitState.value.activePaneId = targetPaneId;
        disableSplit();
        return;
      }
    } else if (sourcePane.activeTabId === tabId) {
      sourcePane.activeTabId = sourcePane.tabs[Math.max(0, tabIndex - 1)].id;
    }

    splitState.value.activePaneId = targetPaneId;
  };

  const reorderTabWithinPane = (paneId: string, tabId: string, newIndex: number): void => {
    const pane = findPane(paneId);
    if (!pane) return;

    const currentIndex = pane.tabs.findIndex(t => t.id === tabId);
    if (currentIndex === -1 || currentIndex === newIndex) return;

    const [tab] = pane.tabs.splice(currentIndex, 1);
    const adjustedIndex = newIndex > currentIndex ? newIndex - 1 : newIndex;
    pane.tabs.splice(adjustedIndex, 0, tab);
  };

  const getActiveTabForPane = (paneId: string): Tab | undefined => {
    const pane = findPane(paneId);
    if (!pane) return undefined;
    return pane.tabs.find(t => t.id === pane.activeTabId);
  };

  const getAllUnsavedTabs = (): Array<{ paneId: string; tab: Tab }> => {
    const unsaved: Array<{ paneId: string; tab: Tab }> = [];
    for (const pane of splitState.value.panes) {
      for (const tab of pane.tabs) {
        if (tab.hasChanges) {
          unsaved.push({ paneId: pane.id, tab });
        }
      }
    }
    return unsaved;
  };

  return {
    splitState,
    activePaneId,
    activePane,
    isSplitActive,
    leftPane,
    rightPane,
    splitRatio,

    enableSplit,
    disableSplit,
    toggleSplit,
    setActivePane,
    setSplitRatio,

    createTab,
    closeTab,
    removeTabWithoutCreate,
    isWindowEmpty,
    switchTab,
    updateTabContent,
    updateTabChanges,
    saveTabScrollPosition,
    findTabByFilePath,

    moveTabBetweenPanes,
    reorderTabWithinPane,

    getActiveTabForPane,
    getAllUnsavedTabs,
  };
}
