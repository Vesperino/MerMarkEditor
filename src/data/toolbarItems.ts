export type ToolbarZone = 'toolbar' | 'statusbar' | 'leftbar';

export type ToolbarItemCategory =
  | 'file-ops'
  | 'edit-history'
  | 'headings'
  | 'text-format'
  | 'lists'
  | 'blocks'
  | 'links-media'
  | 'table'
  | 'mermaid'
  | 'footnote'
  | 'stats'
  | 'zoom'
  | 'view-toggles';

export interface ToolbarItemDef {
  id: string;
  category: ToolbarItemCategory;
  defaultZone: ToolbarZone;
  defaultOrder: number;
  needsEditor: boolean;
  labelKey: string;
}

export const TOOLBAR_ITEMS: ToolbarItemDef[] = [
  // File operations
  { id: 'new-file', category: 'file-ops', defaultZone: 'toolbar', defaultOrder: 10, needsEditor: false, labelKey: 'new' },
  { id: 'open-file', category: 'file-ops', defaultZone: 'toolbar', defaultOrder: 20, needsEditor: false, labelKey: 'open' },
  { id: 'save-file', category: 'file-ops', defaultZone: 'toolbar', defaultOrder: 30, needsEditor: false, labelKey: 'save' },
  { id: 'save-file-as', category: 'file-ops', defaultZone: 'toolbar', defaultOrder: 40, needsEditor: false, labelKey: 'saveAs' },
  { id: 'export-pdf', category: 'file-ops', defaultZone: 'toolbar', defaultOrder: 50, needsEditor: false, labelKey: 'exportPdf' },
  { id: 'show-shortcuts', category: 'file-ops', defaultZone: 'toolbar', defaultOrder: 60, needsEditor: false, labelKey: 'keyboardShortcuts' },
  { id: 'show-settings', category: 'file-ops', defaultZone: 'toolbar', defaultOrder: 70, needsEditor: false, labelKey: 'settings' },

  // Edit history
  { id: 'undo', category: 'edit-history', defaultZone: 'toolbar', defaultOrder: 100, needsEditor: true, labelKey: 'undo' },
  { id: 'redo', category: 'edit-history', defaultZone: 'toolbar', defaultOrder: 110, needsEditor: true, labelKey: 'redo' },

  // Headings
  { id: 'heading-select', category: 'headings', defaultZone: 'toolbar', defaultOrder: 200, needsEditor: true, labelKey: 'heading' },

  // Text formatting
  { id: 'bold', category: 'text-format', defaultZone: 'toolbar', defaultOrder: 300, needsEditor: true, labelKey: 'bold' },
  { id: 'italic', category: 'text-format', defaultZone: 'toolbar', defaultOrder: 310, needsEditor: true, labelKey: 'italic' },
  { id: 'strikethrough', category: 'text-format', defaultZone: 'toolbar', defaultOrder: 320, needsEditor: true, labelKey: 'strikethrough' },
  { id: 'inline-code', category: 'text-format', defaultZone: 'toolbar', defaultOrder: 330, needsEditor: true, labelKey: 'inlineCode' },

  // Lists
  { id: 'bullet-list', category: 'lists', defaultZone: 'toolbar', defaultOrder: 400, needsEditor: true, labelKey: 'bulletList' },
  { id: 'ordered-list', category: 'lists', defaultZone: 'toolbar', defaultOrder: 410, needsEditor: true, labelKey: 'orderedList' },
  { id: 'task-list', category: 'lists', defaultZone: 'toolbar', defaultOrder: 420, needsEditor: true, labelKey: 'taskList' },

  // Block elements
  { id: 'blockquote', category: 'blocks', defaultZone: 'toolbar', defaultOrder: 500, needsEditor: true, labelKey: 'blockquote' },
  { id: 'code-block', category: 'blocks', defaultZone: 'toolbar', defaultOrder: 510, needsEditor: true, labelKey: 'codeBlock' },
  { id: 'horizontal-rule', category: 'blocks', defaultZone: 'toolbar', defaultOrder: 520, needsEditor: true, labelKey: 'horizontalRule' },

  // Links & Media
  { id: 'link', category: 'links-media', defaultZone: 'toolbar', defaultOrder: 600, needsEditor: true, labelKey: 'link' },
  { id: 'image', category: 'links-media', defaultZone: 'toolbar', defaultOrder: 610, needsEditor: true, labelKey: 'image' },

  // Table
  { id: 'table', category: 'table', defaultZone: 'toolbar', defaultOrder: 700, needsEditor: true, labelKey: 'table' },

  // Mermaid
  { id: 'mermaid', category: 'mermaid', defaultZone: 'toolbar', defaultOrder: 800, needsEditor: true, labelKey: 'mermaid' },

  // Footnote
  { id: 'footnote', category: 'footnote', defaultZone: 'toolbar', defaultOrder: 850, needsEditor: true, labelKey: 'footnote' },

  // Stats (characters + words + tokens as single movable group)
  { id: 'stats', category: 'stats', defaultZone: 'toolbar', defaultOrder: 900, needsEditor: false, labelKey: 'stats' },

  // Zoom
  { id: 'zoom-controls', category: 'zoom', defaultZone: 'toolbar', defaultOrder: 1000, needsEditor: false, labelKey: 'zoom' },

  // View toggles
  { id: 'toggle-toc', category: 'view-toggles', defaultZone: 'toolbar', defaultOrder: 1100, needsEditor: false, labelKey: 'tableOfContents' },
  { id: 'toggle-code-view', category: 'view-toggles', defaultZone: 'toolbar', defaultOrder: 1110, needsEditor: false, labelKey: 'codeView' },
  { id: 'toggle-split-view', category: 'view-toggles', defaultZone: 'toolbar', defaultOrder: 1120, needsEditor: false, labelKey: 'splitView' },
  { id: 'toggle-diff', category: 'view-toggles', defaultZone: 'toolbar', defaultOrder: 1130, needsEditor: false, labelKey: 'changes' },
  { id: 'compare-tabs', category: 'view-toggles', defaultZone: 'toolbar', defaultOrder: 1140, needsEditor: false, labelKey: 'compareTabs' },
];

export function getItemDef(id: string): ToolbarItemDef | undefined {
  return TOOLBAR_ITEMS.find(item => item.id === id);
}
