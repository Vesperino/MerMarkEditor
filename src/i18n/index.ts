import { ref, computed } from 'vue';

export type Locale = 'en' | 'pl';

export interface Translations {
  // App
  appName: string;

  // Toolbar - File operations
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

  // Toolbar - Code View
  codeView: string;
  visualView: string;

  // Toolbar - Split View
  splitView: string;
  singleView: string;

  // Stats
  characters: string;
  words: string;

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

  // Mermaid Node
  editDiagram: string;
  saveDiagram: string;
  cancelEdit: string;
  diagramError: string;
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
  autoSave: string;
  autoSaveOn: string;
  autoSaveOff: string;
}

const translations: Record<Locale, Translations> = {
  en: {
    appName: 'MerMark Editor',

    // Toolbar - File operations
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

    // Toolbar - Code View
    codeView: 'Code',
    visualView: 'Visual',

    // Toolbar - Split View
    splitView: 'Split',
    singleView: 'Single',

    // Stats
    characters: 'characters',
    words: 'words',

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
    autoSave: 'Auto-save',
    autoSaveOn: 'On',
    autoSaveOff: 'Off',
  },

  pl: {
    appName: 'MerMark Editor',

    // Toolbar - File operations
    open: 'Otwórz',
    save: 'Zapisz',
    saveAs: 'Zapisz jako',
    exportPdf: 'PDF',

    // Toolbar - Edit operations
    undo: 'Cofnij',
    redo: 'Ponów',

    // Toolbar - Text styles
    paragraph: 'Paragraf',
    heading: 'Nagłówek',
    headingLevel: (level: number) => `Nagłówek ${level}`,

    // Toolbar - Formatting
    bold: 'B',
    boldTooltip: 'Pogrubienie **tekst** (Ctrl+B)',
    italic: 'I',
    italicTooltip: 'Kursywa *tekst* (Ctrl+I)',
    strikethrough: 'S',
    strikethroughTooltip: 'Przekreślenie ~~tekst~~',
    inlineCode: 'Kod',
    inlineCodeTooltip: 'Kod inline `kod`',

    // Toolbar - Lists
    bulletList: 'Lista punktowana - element',
    orderedList: 'Lista numerowana 1. element',
    taskList: 'Lista zadań - [x] zadanie',

    // Toolbar - Blocks
    blockquote: 'Cytat > tekst',
    codeBlock: 'Blok kodu ```kod```',
    horizontalRule: 'Linia pozioma ---',

    // Toolbar - Links & Media
    link: 'Link [tekst](url)',
    linkPrompt: 'URL linku:',
    image: 'Obrazek ![alt](url)',
    imagePrompt: 'URL obrazka:',

    // Toolbar - Table
    table: 'Tabela Markdown',
    insertTable: 'Wstaw tabelę',
    addRowAbove: 'Dodaj wiersz powyżej',
    addRowBelow: 'Dodaj wiersz poniżej',
    addColumnBefore: 'Dodaj kolumnę przed',
    addColumnAfter: 'Dodaj kolumnę po',
    deleteRow: 'Usuń wiersz',
    deleteColumn: 'Usuń kolumnę',
    deleteTable: 'Usuń tabelę',

    // Toolbar - Mermaid
    mermaid: 'Mermaid',
    insertMermaid: 'Wstaw diagram Mermaid',

    // Toolbar - Code View
    codeView: 'Kod',
    visualView: 'Wizualny',

    // Toolbar - Split View
    splitView: 'Podziel',
    singleView: 'Pojedynczy',

    // Stats
    characters: 'znaków',
    words: 'słów',

    // Editor
    placeholder: 'Zacznij pisać lub wklej tekst...',

    // Dialogs
    unsavedChanges: 'Niezapisane zmiany',
    unsavedChangesMessage: 'Ten dokument ma niezapisane zmiany. Czy chcesz zapisać przed zamknięciem?',
    dontSave: 'Nie zapisuj',
    cancel: 'Anuluj',
    saveAndClose: 'Zapisz i zamknij',

    // Tabs
    newDocument: 'Nowy dokument',
    closeTab: 'Zamknij kartę',

    // Mermaid Node
    editDiagram: 'Edytuj',
    saveDiagram: 'Zapisz',
    cancelEdit: 'Anuluj',
    diagramError: 'Błąd renderowania diagramu',
    templates: 'Szablony',
    basic: 'Podstawowe',
    deleteDiagram: 'Usuń',
    moreTemplates: 'Więcej szablonów...',
    mermaidDiagramTemplates: 'Szablony diagramów Mermaid',
    enterMermaidCode: 'Wprowadź kod Mermaid...',
    zoomIn: 'Powiększ',
    zoomOut: 'Pomniejsz',
    reset: 'Reset',
    fit: 'Dopasuj',
    fullscreen: 'Pełny ekran',
    close: 'Zamknij',

    // Template categories
    categoryBasic: 'Podstawowe',
    categoryStatesProcesses: 'Stany i procesy',
    categoryDataRelations: 'Dane i relacje',
    categoryGitRequirements: 'Git i wymagania',
    categoryC4Model: 'C4 Model',
    categoryAdvanced: 'Zaawansowane',

    // File dialogs
    openFile: 'Otwórz plik Markdown',
    saveFile: 'Zapisz plik Markdown',
    markdownFiles: 'Pliki Markdown',
    allFiles: 'Wszystkie pliki',

    // Settings
    autoSave: 'Autozapis',
    autoSaveOn: 'Wł.',
    autoSaveOff: 'Wył.',
  },
};

// Get saved language or default to English
function getInitialLocale(): Locale {
  const saved = localStorage.getItem('mermark-locale') as Locale | null;
  return saved || 'en';
}

// Reactive locale state
const currentLocale = ref<Locale>(getInitialLocale());

// Computed translations
export const t = computed(() => translations[currentLocale.value]);

// Locale getter and setter
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
    locale.value = locale.value === 'en' ? 'pl' : 'en';
  };

  return {
    locale,
    t,
    setLocale,
    toggleLocale,
    availableLocales: ['en', 'pl'] as const,
  };
}

export default translations;
