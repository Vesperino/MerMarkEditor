import { ref, computed } from 'vue';
import en from './locales/en';
import pl from './locales/pl';
import zhCN from './locales/zh-CN';

export type Locale = 'en' | 'pl' | 'zh-CN';

export interface Translations {
  // App
  appName: string;

  // Toolbar - File operations
  new: string;
  open: string;
  save: string;
  saveAs: string;
  exportPdf: string;

  // Toolbar - Edit operations
  undo: string;
  redo: string;

  // Toolbar - Text styles
  paragraph: string;
  heading: string;
  headingLevel: (level: number) => string;

  // Toolbar - Formatting
  bold: string;
  boldTooltip: string;
  italic: string;
  italicTooltip: string;
  strikethrough: string;
  strikethroughTooltip: string;
  inlineCode: string;
  inlineCodeTooltip: string;

  // Toolbar - Lists
  bulletList: string;
  orderedList: string;
  taskList: string;

  // Toolbar - Blocks
  blockquote: string;
  codeBlock: string;
  horizontalRule: string;

  // Toolbar - Links & Media
  link: string;
  linkPrompt: string;
  image: string;
  imagePrompt: string;
  imageFromUrl: string;
  imageFromFile: string;

  // Toolbar - Table
  table: string;
  insertTable: string;
  addRowAbove: string;
  addRowBelow: string;
  addColumnBefore: string;
  addColumnAfter: string;
  deleteRow: string;
  deleteColumn: string;
  deleteTable: string;

  // Toolbar - Mermaid
  mermaid: string;
  insertMermaid: string;

  // Toolbar - Footnotes
  footnote: string;
  insertFootnote: string;
  footnotes: string;
  addFootnote: string;
  deleteFootnotes: string;
  noFootnotes: string;
  footnoteContentPlaceholder: string;
  footnoteBacklink: string;

  // Toolbar - Code View
  codeView: string;
  visualView: string;

  // Toolbar - Split View
  splitView: string;
  singleView: string;

  // Toolbar - Diff Preview
  changes: string;
  noChanges: string;
  closeDiff: string;
  compareTabs: string;
  compareTabsTooltip: string;

  // Keyboard Shortcuts
  keyboardShortcuts: string;
  shortcutAction: string;
  shortcutKey: string;
  nextTab: string;
  previousTab: string;
  jumpToTab: string;
  toggleCodeView: string;
  zoomInOut: string;
  resetZoom: string;

  // Stats
  stats: string;
  characters: string;
  words: string;
  tokens: string;
  tokensTooltip: string;

  // Editor
  placeholder: string;

  // Dialogs
  unsavedChanges: string;
  unsavedChangesMessage: string;
  dontSave: string;
  cancel: string;
  saveAndClose: string;

  // Tabs
  newDocument: string;
  closeTab: string;
  closeTabTooltip: string;

  // Mermaid Node
  editDiagram: string;
  saveDiagram: string;
  cancelEdit: string;
  diagramError: string;
  printScale: string;
  diagramSize: string;
  templates: string;
  basic: string;
  deleteDiagram: string;
  moreTemplates: string;
  mermaidDiagramTemplates: string;
  enterMermaidCode: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
  fit: string;
  fullscreen: string;
  close: string;

  // Template categories
  categoryBasic: string;
  categoryStatesProcesses: string;
  categoryDataRelations: string;
  categoryGitRequirements: string;
  categoryC4Model: string;
  categoryAdvanced: string;

  // File dialogs
  openFile: string;
  saveFile: string;
  markdownFiles: string;
  allFiles: string;

  // Settings
  settings: string;
  autoSave: string;
  autoSaveOn: string;
  autoSaveOff: string;
  wordWrap: string;
  dropFilesHere: string;
  editorFont: string;
  codeFont: string;
  lineHeight: string;
  spellcheck: string;
  expandTabs: string;
  appearance: string;
  editor: string;
  code: string;
  general: string;
  on: string;
  off: string;
  language: string;

  // Update dialog
  updateAvailable: string;
  newVersionAvailable: string;
  downloadingUpdate: string;
  later: string;
  updating: string;
  updateNow: string;
  whatsNew: string;
  whatsNewIn: string;
  loadingChangelog: string;
  changelogError: string;

  // Split view / Panes
  dragTabHere: string;
  orOpenFileInPane: string;
  dropTabHere: string;

  // Save confirm dialog
  fileHasUnsavedChanges: (fileName: string) => string;
  saveBeforeClosing: string;
  discard: string;

  // External link dialog
  openExternalLink: string;
  confirmNavigateTo: string;
  openLink: string;

  // Editor Zoom
  zoom: string;

  // Theme
  darkMode: string;
  lightMode: string;

  // File watching & conflict
  fileReloadedExternally: (fileName: string) => string;
  fileReloaded: string;
  fileReloadError: string;
  fileChangedExternally: string;
  fileConflictMessage: string;
  keepMyChanges: string;
  loadExternalVersion: string;
  externalChanges: string;
  reloadFile: string;
  preSaveConflict: string;
  preSaveConflictMessage: string;
  saveAnyway: string;
  fileDeletedExternally: (fileName: string) => string;

  // Table of Contents
  tableOfContents: string;
  tocTooltip: string;
  tocEmpty: string;

  // Merge editor
  diffView: string;
  mergeView: string;
  acceptAllExternal: string;
  rejectAllExternal: string;
  mergeHint: string;
  unchangedLines: string;
  collapseLines: string;
  changeHunk: string;
  keepOriginal: string;
  acceptExternal: string;
  changesAccepted: string;
  applyMerge: string;

  // Layout customization
  layout: string;
  topToolbar: string;
  bottomStatusBar: string;
  leftSidebar: string;
  hiddenItems: string;
  resetLayout: string;
  layoutDescription: string;
  moveTo: string;

  // Fonts
  systemFonts: string;
  otherFonts: string;

  // Session
  recentFiles: string;
  clearRecentFiles: string;
  noRecentFiles: string;
  restoreSession: string;
}

const translations: Record<Locale, Translations> = {
  en,
  pl,
  'zh-CN': zhCN,
};

const localeLabels: Record<Locale, string> = {
  en: 'English',
  pl: 'Polski',
  'zh-CN': '简体中文',
};

function getInitialLocale(): Locale {
  const saved = localStorage.getItem('mermark-locale') as Locale | null;
  if (saved && saved in translations) return saved;
  return 'en';
}

const currentLocale = ref<Locale>(getInitialLocale());

export const t = computed(() => translations[currentLocale.value]);

export function useI18n() {
  const locale = computed({
    get: () => currentLocale.value,
    set: (value: Locale) => {
      currentLocale.value = value;
      localStorage.setItem('mermark-locale', value);
    },
  });

  const setLocale = (newLocale: Locale) => {
    locale.value = newLocale;
  };

  const toggleLocale = () => {
    const locales = availableLocales;
    const idx = locales.indexOf(locale.value);
    locale.value = locales[(idx + 1) % locales.length];
  };

  const availableLocales: Locale[] = ['en', 'pl', 'zh-CN'];

  return {
    locale,
    t,
    setLocale,
    toggleLocale,
    availableLocales,
    localeLabels,
  };
}

export default translations;
