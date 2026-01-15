import { ref, computed, nextTick, type Ref, type ComputedRef } from 'vue';

export interface Tab {
  id: string;
  filePath: string | null;
  fileName: string;
  content: string;
  hasChanges: boolean;
  scrollTop: number;
}

export interface UseTabsOptions {
  onContentChange?: (content: string) => void;
}

export interface UseTabsReturn {
  tabs: Ref<Tab[]>;
  activeTabId: Ref<string>;
  activeTab: ComputedRef<Tab>;
  createNewTab: (filePath?: string | null, fileContent?: string, fileName?: string) => string;
  switchToTab: (tabId: string, preserveHasChanges?: boolean, getEditorContent?: () => string, setEditorContent?: (content: string) => void) => Promise<void>;
  closeTab: (tabId: string, getEditorContent?: () => string, setEditorContent?: (content: string) => void) => Promise<void>;
  findTabByFilePath: (filePath: string) => Tab | undefined;
  updateTabContent: (content: string) => void;
  updateTabChanges: (hasChanges: boolean) => void;
  saveScrollPosition: (scrollTop: number) => void;
}

export function useTabs(): UseTabsReturn {
  const tabs = ref<Tab[]>([{
    id: 'tab-1',
    filePath: null,
    fileName: 'Nowy dokument',
    content: '<p></p>',
    hasChanges: false,
    scrollTop: 0,
  }]);

  const activeTabId = ref('tab-1');
  let tabCounter = 1;

  const activeTab = computed(() =>
    tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]
  );

  const createNewTab = (
    filePath: string | null = null,
    fileContent: string = '<p></p>',
    fileName: string = 'Nowy dokument'
  ): string => {
    tabCounter++;
    const newTabId = `tab-${tabCounter}`;
    tabs.value.push({
      id: newTabId,
      filePath,
      fileName,
      content: fileContent,
      hasChanges: false,
      scrollTop: 0,
    });
    return newTabId;
  };

  const switchToTab = async (
    tabId: string,
    preserveHasChanges: boolean = true,
    getEditorContent?: () => string,
    setEditorContent?: (content: string) => void
  ): Promise<void> => {
    // Save current editor content to current tab before switching
    if (getEditorContent) {
      const currentTabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
      if (currentTabIndex !== -1) {
        tabs.value[currentTabIndex].content = getEditorContent();
      }
    }

    // Get the target tab's hasChanges state before switching
    const targetTab = tabs.value.find(t => t.id === tabId);
    const targetHasChanges = targetTab?.hasChanges || false;

    activeTabId.value = tabId;

    // Update editor with new tab's content
    if (setEditorContent && activeTab.value) {
      setEditorContent(activeTab.value.content || '<p></p>');

      await nextTick();

      // Preserve the tab's original hasChanges state after content load
      if (preserveHasChanges) {
        const tabIndex = tabs.value.findIndex(t => t.id === tabId);
        if (tabIndex !== -1) {
          tabs.value[tabIndex].hasChanges = targetHasChanges;
        }
      }
    }
  };

  const closeTab = async (
    tabId: string,
    _getEditorContent?: () => string,
    setEditorContent?: (content: string) => void
  ): Promise<void> => {
    const tabIndex = tabs.value.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    // Remove the tab
    tabs.value.splice(tabIndex, 1);

    // If we closed the active tab, switch to another
    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const newIndex = Math.max(0, tabIndex - 1);
        activeTabId.value = tabs.value[newIndex].id;
        if (setEditorContent) {
          setEditorContent(tabs.value[newIndex].content);
        }
      } else {
        // Create a new empty tab if all tabs are closed
        const newTabId = createNewTab();
        activeTabId.value = newTabId;
        if (setEditorContent) {
          setEditorContent('<p></p>');
        }
      }
      await nextTick();
    }
  };

  const findTabByFilePath = (filePath: string): Tab | undefined => {
    return tabs.value.find(t => t.filePath === filePath);
  };

  const updateTabContent = (content: string): void => {
    const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (tabIndex !== -1) {
      tabs.value[tabIndex].content = content;
    }
  };

  const updateTabChanges = (hasChanges: boolean): void => {
    const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (tabIndex !== -1) {
      tabs.value[tabIndex].hasChanges = hasChanges;
    }
  };

  const saveScrollPosition = (scrollTop: number): void => {
    const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (tabIndex !== -1) {
      tabs.value[tabIndex].scrollTop = scrollTop;
    }
  };

  return {
    tabs,
    activeTabId,
    activeTab,
    createNewTab,
    switchToTab,
    closeTab,
    findTabByFilePath,
    updateTabContent,
    updateTabChanges,
    saveScrollPosition,
  };
}
