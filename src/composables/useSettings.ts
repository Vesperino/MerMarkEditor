import { ref, watch } from 'vue';
import type { TokenModelId } from '../services/tokenCounter';
import { TOKEN_MODELS } from '../services/tokenCounter';
import { getCurrentWindow } from '@tauri-apps/api/window';

export type ThemeMode = 'light' | 'dark';

export interface FontPreset {
  id: string;
  label: string;
  fontFamily: string;
}

export const EDITOR_FONTS: FontPreset[] = [
  { id: 'system', label: 'System Default', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif' },
  { id: 'georgia', label: 'Georgia (Serif)', fontFamily: 'Georgia, "Times New Roman", Times, serif' },
  { id: 'times', label: 'Times New Roman', fontFamily: '"Times New Roman", Times, serif' },
  { id: 'palatino', label: 'Palatino', fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { id: 'garamond', label: 'Garamond', fontFamily: 'Garamond, "EB Garamond", serif' },
  { id: 'verdana', label: 'Verdana', fontFamily: 'Verdana, Geneva, sans-serif' },
  { id: 'arial', label: 'Arial', fontFamily: 'Arial, Helvetica, sans-serif' },
  { id: 'segoe-ui', label: 'Segoe UI', fontFamily: '"Segoe UI", Tahoma, Geneva, sans-serif' },
  { id: 'helvetica', label: 'Helvetica', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', fontFamily: '"Trebuchet MS", "Lucida Grande", sans-serif' },
  { id: 'calibri', label: 'Calibri', fontFamily: 'Calibri, "Gill Sans", sans-serif' },
  { id: 'open-sans', label: 'Open Sans', fontFamily: '"Open Sans", sans-serif' },
  { id: 'consolas', label: 'Consolas (Mono)', fontFamily: '"Consolas", "Lucida Console", monospace' },
];

export const CODE_FONTS: FontPreset[] = [
  { id: 'fira-code', label: 'Fira Code', fontFamily: '"Fira Code", "Consolas", monospace' },
  { id: 'consolas', label: 'Consolas', fontFamily: '"Consolas", "Courier New", monospace' },
  { id: 'cascadia-code', label: 'Cascadia Code', fontFamily: '"Cascadia Code", "Cascadia Mono", "Consolas", monospace' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', fontFamily: '"JetBrains Mono", "Fira Code", monospace' },
  { id: 'source-code-pro', label: 'Source Code Pro', fontFamily: '"Source Code Pro", "Consolas", monospace' },
  { id: 'lucida-console', label: 'Lucida Console', fontFamily: '"Lucida Console", "Lucida Sans Typewriter", monospace' },
  { id: 'courier-new', label: 'Courier New', fontFamily: '"Courier New", Courier, monospace' },
  { id: 'monaco', label: 'Monaco', fontFamily: '"Monaco", "Menlo", "Consolas", monospace' },
  { id: 'menlo', label: 'Menlo', fontFamily: '"Menlo", "Monaco", "Consolas", monospace' },
  { id: 'pt-mono', label: 'PT Mono', fontFamily: '"PT Mono", "Consolas", monospace' },
];

export interface AppSettings {
  autoSave: boolean;
  showTokenCount: boolean;
  tokenModel: TokenModelId;
  theme: ThemeMode;
  codeWordWrap: boolean;
  editorFontFamily: string;
  codeFontFamily: string;
  editorLineHeight: number;
  spellcheck: boolean;
  expandTabs: boolean;
}

const STORAGE_KEY = 'mermark-settings';

// Valid model IDs for migration
const VALID_MODEL_IDS = Object.keys(TOKEN_MODELS) as TokenModelId[];

function migrateTokenModel(modelId: string): TokenModelId {
  // If already valid, return as-is
  if (VALID_MODEL_IDS.includes(modelId as TokenModelId)) {
    return modelId as TokenModelId;
  }

  // Migration map for old model IDs to new simplified IDs
  const migrationMap: Record<string, TokenModelId> = {
    // Old GPT models -> gpt
    'gpt3': 'gpt',
    'gpt4': 'gpt',
    'gpt4o': 'gpt',
    'gpt5': 'gpt',
    'gpt52': 'gpt',
    'o1': 'gpt',
    // Old Claude models -> claude
    'claude-opus': 'claude',
    'claude-sonnet': 'claude',
    'claude-haiku': 'claude',
    // Old Gemini models -> gemini
    'gemini-pro': 'gemini',
    'gemini-flash': 'gemini',
    // Other
    'llama3': 'gpt', // Fallback to GPT
  };

  return migrationMap[modelId] || 'gpt';
}

function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old token model IDs
      if (parsed.tokenModel) {
        parsed.tokenModel = migrateTokenModel(parsed.tokenModel);
      }
      return { ...getDefaultSettings(), ...parsed };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return getDefaultSettings();
}

function getDefaultSettings(): AppSettings {
  return {
    autoSave: false,
    showTokenCount: true,
    tokenModel: 'gpt',
    theme: 'light',
    codeWordWrap: true,
    editorFontFamily: 'system',
    codeFontFamily: 'fira-code',
    editorLineHeight: 1.6,
    spellcheck: false,
    expandTabs: false,
  };
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Singleton state
const settings = ref<AppSettings>(loadSettings());

// Auto-save settings when they change
watch(settings, (newSettings) => {
  saveSettings(newSettings);
}, { deep: true });

export function useSettings() {
  const setAutoSave = (value: boolean) => {
    settings.value.autoSave = value;
  };

  const toggleAutoSave = () => {
    settings.value.autoSave = !settings.value.autoSave;
  };

  const setShowTokenCount = (value: boolean) => {
    settings.value.showTokenCount = value;
  };

  const toggleShowTokenCount = () => {
    settings.value.showTokenCount = !settings.value.showTokenCount;
  };

  const setTokenModel = (model: TokenModelId) => {
    settings.value.tokenModel = model;
  };

  const setTheme = (theme: ThemeMode) => {
    settings.value.theme = theme;
    applyTheme(theme);
  };

  const toggleTheme = () => {
    const newTheme = settings.value.theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  const toggleCodeWordWrap = () => {
    settings.value.codeWordWrap = !settings.value.codeWordWrap;
  };

  const setEditorFontFamily = (fontId: string) => {
    settings.value.editorFontFamily = fontId;
    applyCssVars(settings.value);
  };

  const setCodeFontFamily = (fontId: string) => {
    settings.value.codeFontFamily = fontId;
    applyCssVars(settings.value);
  };

  const setEditorLineHeight = (lh: number) => {
    settings.value.editorLineHeight = Math.max(1.0, Math.min(2.5, lh));
    applyCssVars(settings.value);
  };

  const setSpellcheck = (value: boolean) => {
    settings.value.spellcheck = value;
  };

  const setExpandTabs = (value: boolean) => {
    settings.value.expandTabs = value;
  };

  return {
    settings,
    setAutoSave,
    toggleAutoSave,
    setShowTokenCount,
    toggleShowTokenCount,
    setTokenModel,
    setTheme,
    toggleTheme,
    toggleCodeWordWrap,
    setEditorFontFamily,
    setCodeFontFamily,
    setEditorLineHeight,
    setSpellcheck,
    setExpandTabs,
  };
}

// Apply theme class to HTML element
function applyTheme(theme: ThemeMode) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  try {
    getCurrentWindow().setTheme(theme);
  } catch {
    // ignore outside Tauri context
  }
}

// Resolve a font setting to a CSS font-family value.
// If it matches a preset id, use the preset's fontFamily stack;
// otherwise treat the value as a direct system font family name.
function resolveEditorFont(id: string): string {
  const preset = EDITOR_FONTS.find(f => f.id === id);
  if (preset) return preset.fontFamily;
  // Direct system font name — wrap in quotes + sans-serif fallback
  return `"${id}", sans-serif`;
}

function resolveCodeFont(id: string): string {
  const preset = CODE_FONTS.find(f => f.id === id);
  if (preset) return preset.fontFamily;
  return `"${id}", monospace`;
}

// Apply all CSS custom properties to document root
function applyCssVars(s: AppSettings) {
  const root = document.documentElement.style;
  root.setProperty('--editor-font-family', resolveEditorFont(s.editorFontFamily));
  root.setProperty('--code-font-family', resolveCodeFont(s.codeFontFamily));
  root.setProperty('--editor-line-height', `${s.editorLineHeight}`);
}

// Apply theme and CSS vars on initial load
applyTheme(settings.value.theme);
applyCssVars(settings.value);
