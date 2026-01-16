import { ref, watch } from 'vue';
import type { TokenModelId } from '../services/tokenCounter';

export interface AppSettings {
  autoSave: boolean;
  showTokenCount: boolean;
  tokenModel: TokenModelId;
}

const STORAGE_KEY = 'mermark-settings';

function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...getDefaultSettings(), ...JSON.parse(saved) };
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
    tokenModel: 'gpt4',
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

  return {
    settings,
    setAutoSave,
    toggleAutoSave,
    setShowTokenCount,
    toggleShowTokenCount,
    setTokenModel,
  };
}
