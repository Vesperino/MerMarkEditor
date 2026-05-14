import { ref } from 'vue';
import type { PdfSettings } from './usePdfExport';
import { PDF_SETTINGS_DEFAULTS } from './usePdfExport';

export interface PdfPreset {
  id: string;
  name: string;
  settings: PdfSettings;
}

export const PDF_PRESETS_STORAGE_KEY = 'mermark.pdfPresets';

const BUILTIN_PRESETS: PdfPreset[] = [
  {
    id: 'builtin-report',
    name: 'Raport firmowy',
    settings: {
      ...PDF_SETTINGS_DEFAULTS,
      fontSize: '11pt',
      margins: 'wide',
      fontFamily: 'serif',
      header: { enabled: true, left: '{title}', center: '', right: '{date}' },
      footer: { enabled: true, left: '{path}', center: '', right: '{page}/{pages}' },
      showPageNumbers: true,
    },
  },
  {
    id: 'builtin-notes',
    name: 'Notatki',
    settings: {
      ...PDF_SETTINGS_DEFAULTS,
      fontSize: '10pt',
      margins: 'narrow',
      fontFamily: 'sans',
      headingFontFamily: 'sans',
      header: { ...PDF_SETTINGS_DEFAULTS.header, enabled: false },
      footer: { ...PDF_SETTINGS_DEFAULTS.footer, enabled: false },
      showPageNumbers: true,
      pageNumberFormat: 'n',
    },
  },
  {
    id: 'builtin-draft',
    name: 'Draft (z watermarkiem)',
    settings: {
      ...PDF_SETTINGS_DEFAULTS,
      watermark: { ...PDF_SETTINGS_DEFAULTS.watermark, enabled: true, text: 'DRAFT' },
    },
  },
];

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
    return [...BUILTIN_PRESETS, ...customPresets.value];
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
