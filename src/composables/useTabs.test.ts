import { describe, it, expect } from 'vitest';
import { useTabs } from './useTabs';

describe('useTabs', () => {
  describe('initial state', () => {
    it('should start with one default tab', () => {
      const { tabs } = useTabs();
      expect(tabs.value.length).toBe(1);
    });

    it('should have default tab with correct properties', () => {
      const { tabs } = useTabs();
      const defaultTab = tabs.value[0];

      expect(defaultTab.id).toBe('tab-1');
      expect(defaultTab.filePath).toBe(null);
      expect(defaultTab.fileName).toBe('Nowy dokument');
      expect(defaultTab.content).toBe('<p></p>');
      expect(defaultTab.hasChanges).toBe(false);
      expect(defaultTab.scrollTop).toBe(0);
    });

    it('should set first tab as active', () => {
      const { activeTabId, tabs } = useTabs();
      expect(activeTabId.value).toBe(tabs.value[0].id);
    });
  });

  describe('createNewTab', () => {
    it('should create a new tab with default values', () => {
      const { tabs, createNewTab } = useTabs();
      const newTabId = createNewTab();

      expect(tabs.value.length).toBe(2);
      expect(newTabId).toBe('tab-2');
    });

    it('should create a new tab with custom file path', () => {
      const { tabs, createNewTab } = useTabs();
      createNewTab('/path/to/file.md', '<p>Content</p>', 'file.md');

      const newTab = tabs.value[1];
      expect(newTab.filePath).toBe('/path/to/file.md');
      expect(newTab.content).toBe('<p>Content</p>');
      expect(newTab.fileName).toBe('file.md');
    });

    it('should create new tabs with incrementing IDs', () => {
      const { createNewTab } = useTabs();

      const id1 = createNewTab();
      const id2 = createNewTab();
      const id3 = createNewTab();

      expect(id1).toBe('tab-2');
      expect(id2).toBe('tab-3');
      expect(id3).toBe('tab-4');
    });
  });

  describe('updateTabChanges', () => {
    it('should update hasChanges for active tab', () => {
      const { tabs, updateTabChanges } = useTabs();

      expect(tabs.value[0].hasChanges).toBe(false);

      updateTabChanges(true);
      expect(tabs.value[0].hasChanges).toBe(true);

      updateTabChanges(false);
      expect(tabs.value[0].hasChanges).toBe(false);
    });

    it('should only update active tab', () => {
      const { tabs, createNewTab, updateTabChanges } = useTabs();
      createNewTab();

      // Active tab is still tab-1
      updateTabChanges(true);

      expect(tabs.value[0].hasChanges).toBe(true);
      expect(tabs.value[1].hasChanges).toBe(false);
    });
  });

  describe('updateTabContent', () => {
    it('should update content for active tab', () => {
      const { tabs, updateTabContent } = useTabs();

      updateTabContent('<p>New content</p>');
      expect(tabs.value[0].content).toBe('<p>New content</p>');
    });
  });

  describe('findTabByFilePath', () => {
    it('should find tab by file path', () => {
      const { createNewTab, findTabByFilePath } = useTabs();
      createNewTab('/path/to/file.md', '<p>Content</p>', 'file.md');

      const found = findTabByFilePath('/path/to/file.md');
      expect(found).toBeDefined();
      expect(found?.fileName).toBe('file.md');
    });

    it('should return undefined for non-existent path', () => {
      const { findTabByFilePath } = useTabs();

      const found = findTabByFilePath('/non/existent/path.md');
      expect(found).toBeUndefined();
    });
  });

  describe('saveScrollPosition', () => {
    it('should save scroll position for active tab', () => {
      const { tabs, saveScrollPosition } = useTabs();

      saveScrollPosition(150);
      expect(tabs.value[0].scrollTop).toBe(150);
    });
  });

  describe('activeTab computed', () => {
    it('should return the active tab', () => {
      const { activeTab, tabs } = useTabs();

      expect(activeTab.value).toBe(tabs.value[0]);
    });

    it('should update when active tab changes', async () => {
      const { activeTab, activeTabId, createNewTab, tabs } = useTabs();
      createNewTab(null, '<p>Tab 2</p>', 'Tab 2');

      activeTabId.value = tabs.value[1].id;

      expect(activeTab.value.fileName).toBe('Tab 2');
    });
  });

  describe('hasChanges tracking across tabs', () => {
    it('should preserve hasChanges when creating new tabs', () => {
      const { tabs, createNewTab, updateTabChanges } = useTabs();

      updateTabChanges(true);
      createNewTab();

      expect(tabs.value[0].hasChanges).toBe(true);
      expect(tabs.value[1].hasChanges).toBe(false);
    });

    it('should track hasChanges independently for each tab', () => {
      const { tabs, createNewTab, activeTabId, updateTabChanges } = useTabs();
      createNewTab();
      createNewTab();

      // Mark tab 1 as changed
      activeTabId.value = tabs.value[0].id;
      updateTabChanges(true);

      // Mark tab 3 as changed
      activeTabId.value = tabs.value[2].id;
      updateTabChanges(true);

      expect(tabs.value[0].hasChanges).toBe(true);
      expect(tabs.value[1].hasChanges).toBe(false);
      expect(tabs.value[2].hasChanges).toBe(true);
    });
  });
});
