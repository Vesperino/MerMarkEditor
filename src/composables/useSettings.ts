import { ref, watch } from 'vue';
import type { TokenModelId } from '../services/tokenCounter';
import { TOKEN_MODELS } from '../services/tokenCounter';

export type ThemeMode = 'light' | 'dark';

export interface AppSettings {
  autoSave: boolean;
  showTokenCount: boolean;
  tokenModel: TokenModelId;
  theme: ThemeMode;
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

  return {
    settings,
    setAutoSave,
    toggleAutoSave,
    setShowTokenCount,
    toggleShowTokenCount,
    setTokenModel,
    setTheme,
    toggleTheme,
  };
}

// Apply theme class to HTML element
function applyTheme(theme: ThemeMode) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// Apply theme on initial load
applyTheme(settings.value.theme);
