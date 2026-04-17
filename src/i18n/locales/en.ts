import type { Translations } from '../index';

const en: Translations = {
  appName: 'MerMark Editor',

  // Toolbar - File operations
  new: 'New',
  open: 'Open',
  save: 'Save',
  saveAs: 'Save As',
  exportPdf: 'PDF',

  // Toolbar - Edit operations
  undo: 'Undo',
  redo: 'Redo',

  // Toolbar - Text styles
  paragraph: 'Paragraph',
  heading: 'Heading',
  headingLevel: (level: number) => `Heading ${level}`,

  // Toolbar - Formatting
  bold: 'B',
  boldTooltip: 'Bold **text** (Ctrl+B)',
  italic: 'I',
  italicTooltip: 'Italic *text* (Ctrl+I)',
  strikethrough: 'S',
  strikethroughTooltip: 'Strikethrough ~~text~~',
  inlineCode: 'Code',
  inlineCodeTooltip: 'Inline code `code`',

  // Toolbar - Lists
  bulletList: 'Bullet list - item',
  orderedList: 'Numbered list 1. item',
  taskList: 'Task list - [x] task',

  // Toolbar - Blocks
  blockquote: 'Quote > text',
  codeBlock: 'Code block ```code```',
  horizontalRule: 'Horizontal line ---',

  // Toolbar - Links & Media
  link: 'Link [text](url)',
  linkPrompt: 'Link URL:',
  image: 'Image ![alt](url)',
  imagePrompt: 'Image URL:',
  imageFromUrl: 'From URL',
  imageFromFile: 'From file',

  // Toolbar - Table
  table: 'Markdown Table',
  insertTable: 'Insert table',
  addRowAbove: 'Add row above',
  addRowBelow: 'Add row below',
  addColumnBefore: 'Add column before',
  addColumnAfter: 'Add column after',
  deleteRow: 'Delete row',
  deleteColumn: 'Delete column',
  deleteTable: 'Delete table',

  // Toolbar - Mermaid
  mermaid: 'Mermaid',
  insertMermaid: 'Insert Mermaid diagram',

  // Toolbar - Footnotes
  footnote: 'Footnote',
  insertFootnote: 'Insert footnote',
  footnotes: 'Footnotes',
  addFootnote: 'Add footnote',
  deleteFootnotes: 'Delete all footnotes',
  noFootnotes: 'No footnotes defined. Click + to add one.',
  footnoteContentPlaceholder: 'Footnote text...',
  footnoteBacklink: 'Jump to reference',

  // Toolbar - Code View
  codeView: 'Code',
  visualView: 'Visual',

  // Toolbar - Split View
  splitView: 'Split',
  singleView: 'Single',

  // Toolbar - Diff Preview
  changes: 'Changes',
  noChanges: 'No changes',
  closeDiff: 'Close',
  compareTabs: 'Compare',
  compareTabsTooltip: 'Compare left and right tabs (Ctrl+Shift+C)',

  // Keyboard Shortcuts
  keyboardShortcuts: 'Keyboard Shortcuts',
  shortcutAction: 'Action',
  shortcutKey: 'Shortcut',

  // Stats
  stats: 'Statistics',
  characters: 'characters',
  words: 'words',
  tokens: 'tokens',
  tokensTooltip: 'Estimated tokens for AI models (click to change model)',

  // Editor
  placeholder: 'Start typing or paste text...',

  // Dialogs
  unsavedChanges: 'Unsaved Changes',
  unsavedChangesMessage: 'This document has unsaved changes. Do you want to save before closing?',
  dontSave: "Don't Save",
  cancel: 'Cancel',
  saveAndClose: 'Save & Close',

  // Tabs
  newDocument: 'New Document',
  closeTab: 'Close tab',

  // Mermaid Node
  editDiagram: 'Edit',
  saveDiagram: 'Save',
  cancelEdit: 'Cancel',
  diagramError: 'Diagram rendering error',
  printScale: 'PDF',
  diagramSize: 'Size',
  templates: 'Templates',
  basic: 'Basic',
  deleteDiagram: 'Delete',
  moreTemplates: 'More templates...',
  mermaidDiagramTemplates: 'Mermaid Diagram Templates',
  enterMermaidCode: 'Enter Mermaid code...',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  reset: 'Reset',
  fit: 'Fit',
  fullscreen: 'Fullscreen',
  close: 'Close',

  // Template categories
  categoryBasic: 'Basic',
  categoryStatesProcesses: 'States & Processes',
  categoryDataRelations: 'Data & Relations',
  categoryGitRequirements: 'Git & Requirements',
  categoryC4Model: 'C4 Model',
  categoryAdvanced: 'Advanced',

  // File dialogs
  openFile: 'Open Markdown file',
  saveFile: 'Save Markdown file',
  markdownFiles: 'Markdown Files',
  allFiles: 'All Files',

  // Settings
  settings: 'Settings',
  autoSave: 'Auto-save',
  autoSaveOn: 'On',
  autoSaveOff: 'Off',
  wordWrap: 'Word wrap',
  dropFilesHere: 'Drop .md files here',
  editorFont: 'Editor font',
  codeFont: 'Code font',
  lineHeight: 'Line height',
  spellcheck: 'Spellcheck',
  showLineNumbers: 'Line numbers',
  expandTabs: 'Expand tabs to fit name',
  appearance: 'Appearance',
  editor: 'Editor',
  code: 'Code',
  general: 'General',
  on: 'On',
  off: 'Off',
  language: 'Language',

  // Update dialog
  updateAvailable: 'Update Available',
  newVersionAvailable: 'A new version is available:',
  downloadingUpdate: 'Downloading update...',
  later: 'Later',
  updating: 'Updating...',
  updateNow: 'Update Now',
  whatsNew: "What's New",
  whatsNewIn: "What's New in",
  loadingChangelog: 'Loading changelog...',
  changelogError: 'Could not load changelog.',

  // Split view / Panes
  dragTabHere: 'Drag tab here',
  orOpenFileInPane: 'or open a file in this pane',
  dropTabHere: 'Drop tab here',

  // Save confirm dialog
  fileHasUnsavedChanges: (fileName: string) => `File "${fileName}" has unsaved changes.`,
  saveBeforeClosing: 'Do you want to save before closing?',
  discard: 'Discard',

  // External link dialog
  openExternalLink: 'Open External Link',
  confirmNavigateTo: 'Are you sure you want to navigate to:',
  openLink: 'Open',

  // Editor Zoom
  zoom: 'Zoom',

  // Theme
  darkMode: 'Dark',
  lightMode: 'Light',

  // File watching & conflict
  fileReloadedExternally: (fileName: string) => `"${fileName}" was updated externally and reloaded.`,
  fileReloaded: 'File reloaded from disk.',
  fileReloadError: 'Could not reload file from disk.',
  fileChangedExternally: 'File Changed Externally',
  fileConflictMessage: 'The file has been modified outside the editor while you have unsaved changes.',
  keepMyChanges: 'Keep My Changes',
  loadExternalVersion: 'Load External Version',
  externalChanges: 'External Changes',
  reloadFile: 'Reload file',
  preSaveConflict: 'File Modified',
  preSaveConflictMessage: 'The file has been modified externally since you last loaded or saved it.',
  saveAnyway: 'Save Anyway',
  fileDeletedExternally: (fileName: string) => `"${fileName}" was deleted externally.`,

  // Table of Contents
  tableOfContents: 'Table of Contents',
  tocTooltip: 'Table of Contents (Ctrl+Shift+T)',
  tocEmpty: 'No headings found. Add headings (H1-H6) to see the table of contents.',

  // Merge editor
  diffView: 'Diff',
  mergeView: 'Merge',
  acceptAllExternal: 'Accept All External',
  rejectAllExternal: 'Reject All External',
  mergeHint: 'Select which external changes to keep',
  unchangedLines: 'unchanged lines',
  collapseLines: 'Collapse',
  changeHunk: 'Change',
  keepOriginal: 'Keep Mine',
  acceptExternal: 'Take External',
  changesAccepted: 'changes accepted',
  applyMerge: 'Apply Merge',

  // Layout customization
  layout: 'Layout',
  topToolbar: 'Top Toolbar',
  bottomStatusBar: 'Bottom Status Bar',
  leftSidebar: 'Left Sidebar',
  hiddenItems: 'Hidden Items',
  resetLayout: 'Reset to Defaults',
  layoutDescription: 'Drag items between zones to customize the layout',
  moveTo: 'Move to',

  // Fonts
  systemFonts: 'System Fonts',
  otherFonts: 'Other Fonts',

  // Session
  recentFiles: 'Recent Files',
  clearRecentFiles: 'Clear Recent Files',
  noRecentFiles: 'No recent files',
  restoreSession: 'Restore previous session',
};

export default en;
