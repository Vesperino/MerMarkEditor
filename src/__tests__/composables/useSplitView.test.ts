import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSplitView } from '../../composables/useSplitView';

// Mock localStorage
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
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

describe('useSplitView', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();

    // Reset the singleton state by clearing localStorage before each test
    // and reimporting would be ideal, but we'll work with what we have
  });

  describe('initial state', () => {
    it('should start with a single left pane', () => {
      const { splitState, isSplitActive, leftPane } = useSplitView();

      expect(splitState.value.panes.length).toBe(1);
      expect(isSplitActive.value).toBe(false);
      expect(leftPane.value).toBeDefined();
      expect(leftPane.value.id).toBe('left');
    });

    it('should have a default tab in the left pane', () => {
      const { leftPane } = useSplitView();

      expect(leftPane.value.tabs.length).toBeGreaterThanOrEqual(1);
      expect(leftPane.value.activeTabId).toBeDefined();
    });

    it('should start with splitRatio of 0.5', () => {
      const { splitRatio } = useSplitView();

      expect(splitRatio.value).toBe(0.5);
    });
  });

  describe('split operations', () => {
    it('should enable split view', () => {
      const { enableSplit, isSplitActive, splitState, rightPane } = useSplitView();

      enableSplit();

      expect(isSplitActive.value).toBe(true);
      expect(splitState.value.panes.length).toBe(2);
      expect(rightPane.value).toBeDefined();
      expect(rightPane.value?.id).toBe('right');
    });

    it('should not create duplicate right pane when already split', () => {
      const { enableSplit, splitState } = useSplitView();

      enableSplit();
      const paneCountAfterFirst = splitState.value.panes.length;

      enableSplit();
      expect(splitState.value.panes.length).toBe(paneCountAfterFirst);
    });

    it('should disable split view and merge tabs', () => {
      const { enableSplit, disableSplit, isSplitActive, splitState, createTab } = useSplitView();

      enableSplit();
      createTab('right', null, '<p>Right tab content</p>', 'Right Tab');

      const leftTabsCount = splitState.value.panes[0].tabs.length;
      const rightTabsCount = splitState.value.panes[1].tabs.length;

      disableSplit();

      expect(isSplitActive.value).toBe(false);
      expect(splitState.value.panes.length).toBe(1);
      expect(splitState.value.panes[0].tabs.length).toBe(leftTabsCount + rightTabsCount);
    });

    it('should toggle split view', () => {
      const { toggleSplit, isSplitActive } = useSplitView();

      expect(isSplitActive.value).toBe(false);

      toggleSplit();
      expect(isSplitActive.value).toBe(true);

      toggleSplit();
      expect(isSplitActive.value).toBe(false);
    });
  });

  describe('pane operations', () => {
    it('should set active pane', () => {
      const { enableSplit, setActivePane, activePaneId } = useSplitView();

      enableSplit();

      setActivePane('right');
      expect(activePaneId.value).toBe('right');

      setActivePane('left');
      expect(activePaneId.value).toBe('left');
    });

    it('should not change active pane for invalid pane id', () => {
      const { setActivePane, activePaneId } = useSplitView();

      const originalPaneId = activePaneId.value;
      setActivePane('invalid-pane');

      expect(activePaneId.value).toBe(originalPaneId);
    });

    it('should set split ratio within bounds', () => {
      const { setSplitRatio, splitRatio } = useSplitView();

      setSplitRatio(0.3);
      expect(splitRatio.value).toBe(0.3);

      // Test min bound
      setSplitRatio(0.1);
      expect(splitRatio.value).toBe(0.2);

      // Test max bound
      setSplitRatio(0.9);
      expect(splitRatio.value).toBe(0.8);
    });
  });

  describe('tab operations', () => {
    it('should create a new tab in the specified pane', () => {
      const { createTab, leftPane } = useSplitView();

      const initialCount = leftPane.value.tabs.length;
      const newTabId = createTab('left', '/path/to/file.md', '<p>Content</p>', 'Test File');

      expect(newTabId).toBeTruthy();
      expect(leftPane.value.tabs.length).toBe(initialCount + 1);
      expect(leftPane.value.activeTabId).toBe(newTabId);

      const newTab = leftPane.value.tabs.find(t => t.id === newTabId);
      expect(newTab).toBeDefined();
      expect(newTab?.filePath).toBe('/path/to/file.md');
      expect(newTab?.fileName).toBe('Test File');
      expect(newTab?.content).toBe('<p>Content</p>');
    });

    it('should close a tab and switch to adjacent tab', () => {
      const { createTab, closeTab, leftPane } = useSplitView();

      // Create multiple tabs
      const tab1 = createTab('left', null, '<p>Tab 1</p>', 'Tab 1');
      const tab2 = createTab('left', null, '<p>Tab 2</p>', 'Tab 2');
      const tab3 = createTab('left', null, '<p>Tab 3</p>', 'Tab 3');

      // Active should be tab3 (last created)
      expect(leftPane.value.activeTabId).toBe(tab3);

      // Close tab3, should switch to tab2
      closeTab('left', tab3);
      expect(leftPane.value.activeTabId).toBe(tab2);

      // Close tab2, should switch to tab1
      closeTab('left', tab2);
      expect(leftPane.value.activeTabId).toBe(tab1);
    });

    it('should create a new tab when closing the last tab with autoCreateNew=true', () => {
      const { leftPane, closeTab } = useSplitView();

      // Close all tabs one by one until only one remains
      while (leftPane.value.tabs.length > 1) {
        closeTab('left', leftPane.value.tabs[0].id);
      }

      const lastTabId = leftPane.value.tabs[0].id;
      closeTab('left', lastTabId, true);

      // Should have created a new tab
      expect(leftPane.value.tabs.length).toBe(1);
      expect(leftPane.value.tabs[0].id).not.toBe(lastTabId);
    });

    it('should leave pane empty when closing the last tab without autoCreateNew', () => {
      const { leftPane, closeTab } = useSplitView();

      // Close all tabs one by one until only one remains
      while (leftPane.value.tabs.length > 1) {
        closeTab('left', leftPane.value.tabs[0].id);
      }

      const lastTabId = leftPane.value.tabs[0].id;
      closeTab('left', lastTabId);

      // Pane should be empty
      expect(leftPane.value.tabs.length).toBe(0);
    });

    it('should switch to a specific tab', () => {
      const { createTab, switchTab, leftPane } = useSplitView();

      const tab1 = createTab('left', null, '<p>Tab 1</p>', 'Tab 1');
      const tab2 = createTab('left', null, '<p>Tab 2</p>', 'Tab 2');

      expect(leftPane.value.activeTabId).toBe(tab2);

      switchTab('left', tab1);
      expect(leftPane.value.activeTabId).toBe(tab1);
    });

    it('should update tab content', () => {
      const { createTab, leftPane } = useSplitView();
      const { updateTabContent } = useSplitView();

      const tabId = createTab('left', null, '<p>Original</p>', 'Test');

      updateTabContent('left', tabId, '<p>Updated content</p>');

      const tab = leftPane.value.tabs.find(t => t.id === tabId);
      expect(tab?.content).toBe('<p>Updated content</p>');
    });

    it('should update tab changes flag', () => {
      const { createTab, leftPane } = useSplitView();
      const { updateTabChanges } = useSplitView();

      const tabId = createTab('left', null, '<p>Content</p>', 'Test');

      expect(leftPane.value.tabs.find(t => t.id === tabId)?.hasChanges).toBe(false);

      updateTabChanges('left', tabId, true);
      expect(leftPane.value.tabs.find(t => t.id === tabId)?.hasChanges).toBe(true);

      updateTabChanges('left', tabId, false);
      expect(leftPane.value.tabs.find(t => t.id === tabId)?.hasChanges).toBe(false);
    });
  });

  describe('cross-pane operations', () => {
    it('should move tab between panes', () => {
      const { enableSplit, createTab, moveTabBetweenPanes, leftPane, rightPane } = useSplitView();

      enableSplit();

      const tabId = createTab('left', null, '<p>Movable</p>', 'Movable Tab');

      moveTabBetweenPanes({
        tabId,
        sourcePaneId: 'left',
        targetPaneId: 'right',
      });

      expect(leftPane.value.tabs.find(t => t.id === tabId)).toBeUndefined();
      expect(rightPane.value?.tabs.find(t => t.id === tabId)).toBeDefined();
      expect(rightPane.value?.activeTabId).toBe(tabId);
    });

    it('should auto-close split when source pane becomes empty after move', () => {
      const { enableSplit, moveTabBetweenPanes, leftPane, isSplitActive, closeTab, createTab } = useSplitView();

      // First ensure split is disabled and we have a known starting state
      // Create a fresh tab that we'll move
      const testTabId = createTab('left', '/test/file.md', '<p>Test</p>', 'Test Tab');

      enableSplit();

      // Close all tabs except the test tab
      const tabsToClose = leftPane.value.tabs.filter(t => t.id !== testTabId);
      tabsToClose.forEach(t => closeTab('left', t.id));

      expect(leftPane.value.tabs.length).toBe(1);
      expect(leftPane.value.tabs[0].id).toBe(testTabId);

      moveTabBetweenPanes({
        tabId: testTabId,
        sourcePaneId: 'left',
        targetPaneId: 'right',
      });

      // Split should be disabled and tabs merged to left pane
      expect(isSplitActive.value).toBe(false);
      expect(leftPane.value.tabs.some(t => t.id === testTabId)).toBe(true);
    });

    it('should reorder tabs within the same pane', () => {
      const { createTab, leftPane, reorderTabWithinPane } = useSplitView();

      const tab1 = createTab('left', null, '<p>Tab 1</p>', 'Tab 1');
      const tab2 = createTab('left', null, '<p>Tab 2</p>', 'Tab 2');
      const tab3 = createTab('left', null, '<p>Tab 3</p>', 'Tab 3');

      // Initial order: ..., tab1, tab2, tab3
      const initialTabs = leftPane.value.tabs.slice(-3);
      expect(initialTabs.map(t => t.id)).toEqual([tab1, tab2, tab3]);

      // Move tab3 to position of tab1
      const tab1Index = leftPane.value.tabs.findIndex(t => t.id === tab1);
      reorderTabWithinPane('left', tab3, tab1Index);

      // New order should be: ..., tab3, tab1, tab2
      const reorderedTabs = leftPane.value.tabs.slice(-3);
      expect(reorderedTabs.map(t => t.id)).toEqual([tab3, tab1, tab2]);
    });
  });

  describe('utility functions', () => {
    it('should find tab by file path', () => {
      const { createTab, findTabByFilePath, enableSplit } = useSplitView();

      enableSplit();

      createTab('left', '/path/to/file1.md', '<p>File 1</p>', 'File 1');
      createTab('right', '/path/to/file2.md', '<p>File 2</p>', 'File 2');

      const result1 = findTabByFilePath('/path/to/file1.md');
      expect(result1).toBeDefined();
      expect(result1?.tab.fileName).toBe('File 1');

      const result2 = findTabByFilePath('/path/to/file2.md');
      expect(result2).toBeDefined();
      expect(result2?.tab.fileName).toBe('File 2');

      const result3 = findTabByFilePath('/nonexistent/path.md');
      expect(result3).toBeUndefined();
    });

    it('should get active tab for a pane', () => {
      const { createTab, getActiveTabForPane } = useSplitView();

      const tabId = createTab('left', null, '<p>Active</p>', 'Active Tab');

      const activeTab = getActiveTabForPane('left');
      expect(activeTab).toBeDefined();
      expect(activeTab?.id).toBe(tabId);
    });

    it('should get all unsaved tabs across panes', () => {
      const { enableSplit, createTab, getAllUnsavedTabs } = useSplitView();
      const { updateTabChanges } = useSplitView();

      enableSplit();

      const tab1 = createTab('left', '/file1.md', '<p>1</p>', 'File 1');
      const tab2 = createTab('left', '/file2.md', '<p>2</p>', 'File 2');
      const tab3 = createTab('right', '/file3.md', '<p>3</p>', 'File 3');

      // Mark some tabs as having changes
      updateTabChanges('left', tab1, true);
      updateTabChanges('right', tab3, true);

      const unsavedTabs = getAllUnsavedTabs();

      expect(unsavedTabs.length).toBe(2);
      expect(unsavedTabs.some(({ tab }) => tab.id === tab1)).toBe(true);
      expect(unsavedTabs.some(({ tab }) => tab.id === tab2)).toBe(false);
      expect(unsavedTabs.some(({ tab }) => tab.id === tab3)).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should save split ratio to localStorage', async () => {
      const { setSplitRatio } = useSplitView();

      setSplitRatio(0.6);

      // Wait for the watcher to trigger
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'mermark-split-view',
        expect.stringContaining('0.6')
      );
    });
  });
});
