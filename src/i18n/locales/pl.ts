import type { Translations } from '../index';

const pl: Translations = {
  appName: 'MerMark Editor',

  // Toolbar - File operations
  new: 'Nowy',
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
  imageFromUrl: 'Z adresu URL',
  imageFromFile: 'Z pliku',

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

  // Toolbar - Footnotes
  footnote: 'Przypis',
  insertFootnote: 'Wstaw przypis',
  footnotes: 'Przypisy',
  addFootnote: 'Dodaj przypis',
  deleteFootnotes: 'Usuń wszystkie przypisy',
  noFootnotes: 'Brak przypisów. Kliknij + aby dodać.',
  footnoteContentPlaceholder: 'Treść przypisu...',
  footnoteBacklink: 'Skocz do odnośnika',

  // Toolbar - Code View
  codeView: 'Kod',
  visualView: 'Wizualny',

  // Toolbar - Split View
  splitView: 'Podziel',
  singleView: 'Pojedynczy',

  // Toolbar - Diff Preview
  changes: 'Zmiany',
  noChanges: 'Brak zmian',
  closeDiff: 'Zamknij',
  compareTabs: 'Porównaj',
  compareTabsTooltip: 'Porównaj lewy i prawy tab (Ctrl+Shift+C)',

  // Keyboard Shortcuts
  keyboardShortcuts: 'Skróty klawiszowe',
  shortcutAction: 'Akcja',
  shortcutKey: 'Skrót',
  nextTab: 'Następna karta',
  previousTab: 'Poprzednia karta',
  jumpToTab: 'Przejdź do karty 1–9',
  toggleCodeView: 'Przełącz widok Kod / Wizualny',
  zoomInOut: 'Powiększ / pomniejsz',
  resetZoom: 'Reset powiększenia',

  // Stats
  stats: 'Statystyki',
  characters: 'znaków',
  words: 'słów',
  tokens: 'tokenów',
  tokensTooltip: 'Szacunkowa liczba tokenów dla modeli AI (kliknij aby zmienić model)',

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
  closeTabTooltip: 'Zamknij kartę (Ctrl+W)',

  // Mermaid Node
  editDiagram: 'Edytuj',
  saveDiagram: 'Zapisz',
  cancelEdit: 'Anuluj',
  diagramError: 'Błąd renderowania diagramu',
  printScale: 'PDF',
  diagramSize: 'Rozmiar',
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
  settings: 'Ustawienia',
  autoSave: 'Autozapis',
  autoSaveOn: 'Wł.',
  autoSaveOff: 'Wył.',
  wordWrap: 'Zawijanie wierszy',
  dropFilesHere: 'Upuść pliki .md tutaj',
  editorFont: 'Czcionka edytora',
  codeFont: 'Czcionka kodu',
  lineHeight: 'Wysokość linii',
  spellcheck: 'Sprawdzanie pisowni',
  showLineNumbers: 'Numery linii',
  expandTabs: 'Rozszerz karty do pełnej nazwy',
  appearance: 'Wygląd',
  editor: 'Edytor',
  code: 'Kod',
  general: 'Ogólne',
  on: 'Wł.',
  off: 'Wył.',
  language: 'Język',

  // Update dialog
  updateAvailable: 'Dostępna aktualizacja',
  newVersionAvailable: 'Dostępna jest nowa wersja:',
  downloadingUpdate: 'Pobieranie aktualizacji...',
  later: 'Później',
  updating: 'Aktualizowanie...',
  updateNow: 'Aktualizuj teraz',
  whatsNew: 'Co nowego',
  whatsNewIn: 'Co nowego w',
  loadingChangelog: 'Wczytywanie zmian...',
  changelogError: 'Nie udało się wczytać zmian.',

  // Split view / Panes
  dragTabHere: 'Przeciągnij kartę tutaj',
  orOpenFileInPane: 'lub otwórz plik w tym panelu',
  dropTabHere: 'Upuść kartę tutaj',

  // Save confirm dialog
  fileHasUnsavedChanges: (fileName: string) => `Plik "${fileName}" zawiera niezapisane zmiany.`,
  saveBeforeClosing: 'Czy chcesz zapisać przed zamknięciem?',
  discard: 'Odrzuć',

  // External link dialog
  openExternalLink: 'Otwórz link zewnętrzny',
  confirmNavigateTo: 'Czy na pewno chcesz przejść do:',
  openLink: 'Otwórz',

  // Editor Zoom
  zoom: 'Powiększenie',

  // Theme
  darkMode: 'Ciemny',
  lightMode: 'Jasny',

  // File watching & conflict
  fileReloadedExternally: (fileName: string) => `"${fileName}" został zaktualizowany zewnętrznie i ponownie wczytany.`,
  fileReloaded: 'Plik ponownie wczytany z dysku.',
  fileReloadError: 'Nie udało się ponownie wczytać pliku z dysku.',
  fileChangedExternally: 'Plik zmieniony zewnętrznie',
  fileConflictMessage: 'Plik został zmodyfikowany poza edytorem, a Ty masz niezapisane zmiany.',
  keepMyChanges: 'Zachowaj moje zmiany',
  loadExternalVersion: 'Wczytaj zewnętrzną wersję',
  externalChanges: 'Zmiany zewnętrzne',
  reloadFile: 'Wczytaj ponownie',
  preSaveConflict: 'Plik zmodyfikowany',
  preSaveConflictMessage: 'Plik został zmodyfikowany zewnętrznie od ostatniego wczytania lub zapisania.',
  saveAnyway: 'Zapisz mimo to',
  fileDeletedExternally: (fileName: string) => `"${fileName}" został usunięty zewnętrznie.`,

  // Table of Contents
  tableOfContents: 'Spis treści',
  tocTooltip: 'Spis treści (Ctrl+Shift+T)',
  tocEmpty: 'Brak nagłówków. Dodaj nagłówki (H1-H6) aby zobaczyć spis treści.',

  // Merge editor
  diffView: 'Diff',
  mergeView: 'Merge',
  acceptAllExternal: 'Zaakceptuj wszystkie zewnętrzne',
  rejectAllExternal: 'Odrzuć wszystkie zewnętrzne',
  mergeHint: 'Wybierz które zmiany zewnętrzne zachować',
  unchangedLines: 'niezmienione linie',
  collapseLines: 'Zwiń',
  changeHunk: 'Zmiana',
  keepOriginal: 'Zachowaj moje',
  acceptExternal: 'Weź zewnętrzną',
  changesAccepted: 'zmian zaakceptowanych',
  applyMerge: 'Zastosuj merge',

  // Layout customization
  layout: 'Układ',
  topToolbar: 'Górny pasek narzędzi',
  bottomStatusBar: 'Dolny pasek statusu',
  leftSidebar: 'Lewy panel',
  hiddenItems: 'Ukryte elementy',
  resetLayout: 'Przywróć domyślne',
  layoutDescription: 'Przeciągnij elementy między strefami aby dostosować układ',
  moveTo: 'Przenieś do',

  // Fonts
  systemFonts: 'Czcionki systemowe',
  otherFonts: 'Inne czcionki',

  // Session
  recentFiles: 'Ostatnie pliki',
  clearRecentFiles: 'Wyczyść ostatnie pliki',
  noRecentFiles: 'Brak ostatnich plików',
  restoreSession: 'Przywróć poprzednią sesję',
};

export default pl;
