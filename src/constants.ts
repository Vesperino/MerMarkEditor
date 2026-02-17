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
} as const;

/** Code editor line height for scroll calculations */
export const CODE_EDITOR_LINE_HEIGHT = 22.4;

/** Maximum number of DOM restore attempts */
export const MAX_DOM_RESTORE_ATTEMPTS = 20;

/** Scroll offset from top when navigating to an element */
export const SCROLL_OFFSET = 80;

/** Padding around highlight box */
export const HIGHLIGHT_PADDING = 4;
