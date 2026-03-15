/** Default content for an empty editor tab */
export const EMPTY_TAB_CONTENT = '<p></p>';

/** Default fallback filename when file name cannot be determined */
export const DEFAULT_FILE_NAME = 'Dokument';

/** DOM selectors used across the application */
export const DOM_SELECTORS = {
  EDITOR_CONTAINER: '.editor-container',
  ACTIVE_EDITOR_CONTAINER: '.editor-pane.active .editor-container',
  PROSE_MIRROR: '.ProseMirror',
  EDITOR_CONTENT: '.editor-content',
} as const;

/** Timing constants (in milliseconds) */
export const TIMING = {
  /** Delay for window maximize animation to complete before printing */
  MAXIMIZE_ANIMATION_DELAY: 200,
  /** Delay before attempting DOM restore after view switch */
  VIEW_SWITCH_RESTORE_DELAY: 150,
  /** Interval for retrying DOM element lookups */
  DOM_RETRY_INTERVAL: 60,
  /** Duration of cursor highlight animation */
  HIGHLIGHT_DURATION: 1000,
  /** Delay before highlighting cursor after code view switch */
  HIGHLIGHT_DELAY: 100,
  /** Debounce delay for file watcher events (AI editors write in multiple steps) */
  FILE_WATCH_DEBOUNCE: 500,
  /** Grace period to ignore file watch events after our own save */
  OWN_SAVE_GRACE_PERIOD: 2000,
  /** Duration for toast notification auto-dismiss */
  TOAST_DURATION: 3000,
} as const;

/** Maximum number of DOM restore attempts */
export const MAX_DOM_RESTORE_ATTEMPTS = 20;

/** Scroll offset from top when navigating to an element */
export const SCROLL_OFFSET = 80;

/** Padding around highlight box */
export const HIGHLIGHT_PADDING = 4;
