import { ref } from 'vue';
import type { PdfSettings } from './usePdfExport';
import { PDF_SETTINGS_DEFAULTS } from './usePdfExport';
import { t } from '../i18n';

export interface PdfPreset {
  id: string;
  name: string;
  settings: PdfSettings;
}

export const PDF_PRESETS_STORAGE_KEY = 'mermark.pdfPresets';

const BUILTIN_PRESET_SETTINGS: Record<string, PdfSettings> = {
  'builtin-report': {
    ...PDF_SETTINGS_DEFAULTS,
    fontSize: '11pt',
    margins: 'wide',
    fontFamily: 'charter',
    header: { enabled: true, left: '{title}', center: '', right: '{date}' },
    footer: { enabled: true, left: '{path}', center: '', right: '{page}/{pages}' },
    showPageNumbers: true,
  },
  'builtin-notes': {
    ...PDF_SETTINGS_DEFAULTS,
    fontSize: '10pt',
    margins: 'narrow',
    fontFamily: 'inter',
    headingFontFamily: 'inter',
    header: { ...PDF_SETTINGS_DEFAULTS.header, enabled: false },
    footer: { ...PDF_SETTINGS_DEFAULTS.footer, enabled: false },
    showPageNumbers: true,
    pageNumberFormat: 'n',
  },
  'builtin-draft': {
    ...PDF_SETTINGS_DEFAULTS,
    watermark: { ...PDF_SETTINGS_DEFAULTS.watermark, enabled: true, text: 'DRAFT' },
  },
};

function builtinPresets(): PdfPreset[] {
  return [
    { id: 'builtin-report', name: t.value.pdfPresetReport, settings: BUILTIN_PRESET_SETTINGS['builtin-report'] },
    { id: 'builtin-notes',  name: t.value.pdfPresetNotes,  settings: BUILTIN_PRESET_SETTINGS['builtin-notes'] },
    { id: 'builtin-draft',  name: t.value.pdfPresetDraft,  settings: BUILTIN_PRESET_SETTINGS['builtin-draft'] },
  ];
}

function loadCustomPresets(): PdfPreset[] {
  try {
    const raw = localStorage.getItem(PDF_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PdfPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: PdfPreset[]): void {
  localStorage.setItem(PDF_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

export function isBuiltinPreset(id: string): boolean {
  return id.startsWith('builtin-');
}

export function usePdfPresets() {
  const customPresets = ref<PdfPreset[]>(loadCustomPresets());

  function allPresets(): PdfPreset[] {
    return [...builtinPresets(), ...customPresets.value];
  }

  function findPreset(id: string): PdfPreset | undefined {
    return allPresets().find(p => p.id === id);
  }

  function savePreset(name: string, settings: PdfSettings): PdfPreset {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const preset: PdfPreset = { id, name, settings: { ...settings } };
    customPresets.value = [...customPresets.value, preset];
    saveCustomPresets(customPresets.value);
    return preset;
  }

  function updatePreset(id: string, name: string, settings: PdfSettings): void {
    if (isBuiltinPreset(id)) return;
    customPresets.value = customPresets.value.map(p =>
      p.id === id ? { ...p, name, settings: { ...settings } } : p,
    );
    saveCustomPresets(customPresets.value);
  }

  function deletePreset(id: string): void {
    if (isBuiltinPreset(id)) return;
    customPresets.value = customPresets.value.filter(p => p.id !== id);
    saveCustomPresets(customPresets.value);
  }

  return {
    customPresets,
    allPresets,
    findPreset,
    savePreset,
    updatePreset,
    deletePreset,
  };
}
