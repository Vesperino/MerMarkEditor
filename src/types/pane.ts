import type { Tab } from '../composables/useTabs';

/**
 * Represents a single editor pane that can contain multiple tabs
 */
export interface Pane {
  /** Unique identifier for the pane */
  id: string;
  /** Tabs contained in this pane */
  tabs: Tab[];
  /** ID of the currently active tab in this pane */
  activeTabId: string;
  /** Saved scroll position for the pane */
  scrollTop: number;
}

/**
 * State for managing split view layout
 */
export interface SplitViewState {
  /** Array of panes (1 for single view, 2 for split view) */
  panes: Pane[];
  /** ID of the currently focused pane */
  activePaneId: string;
  /** Whether split view is currently active */
  isSplitActive: boolean;
  /** Ratio of left pane width (0.0-1.0) */
  splitRatio: number;
}

/**
 * Payload for moving a tab between panes
 */
export interface TabMovePayload {
  tabId: string;
  sourcePaneId: string;
  targetPaneId: string;
  /** Optional index to insert at in target pane */
  targetIndex?: number;
}

/**
 * Creates a default empty pane
 */
export function createDefaultPane(id: string): Pane {
  return {
    id,
    tabs: [{
      id: `${id}-tab-1`,
      filePath: null,
      fileName: 'Nowy dokument',
      content: '<p></p>',
      hasChanges: false,
      scrollTop: 0,
    }],
    activeTabId: `${id}-tab-1`,
    scrollTop: 0,
  };
}

/**
 * Creates the default split view state (single pane mode)
 */
export function createDefaultSplitViewState(): SplitViewState {
  const leftPane = createDefaultPane('left');
  return {
    panes: [leftPane],
    activePaneId: 'left',
    isSplitActive: false,
    splitRatio: 0.5,
  };
}
