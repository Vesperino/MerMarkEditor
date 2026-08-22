export interface CodeEditorSelection {
  start: number;
  end: number;
}

export interface CodeEditorHandle {
  focus: () => void;
  getValue: () => string;
  getSelection: () => CodeEditorSelection;
  setSelection: (start: number, end?: number) => void;
  replaceSelection: (text: string) => void;
  getScrollRatio: () => number;
  scrollToRatio: (ratio: number) => void;
  scrollToPosition: (position: number) => void;
  highlightSelectionLine: (durationMs?: number) => void;
}
