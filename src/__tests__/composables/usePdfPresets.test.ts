import { describe, it, expect, beforeEach } from 'vitest';
import { usePdfPresets, isBuiltinPreset, PDF_PRESETS_STORAGE_KEY } from '../../composables/usePdfPresets';
import { PDF_SETTINGS_DEFAULTS } from '../../composables/usePdfExport';

describe('usePdfPresets', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exposes builtin presets', () => {
    const { allPresets } = usePdfPresets();
    const ids = allPresets().map(p => p.id);
    expect(ids).toContain('builtin-report');
    expect(ids).toContain('builtin-notes');
    expect(ids).toContain('builtin-draft');
  });

  it('saves a custom preset to localStorage', () => {
    const { savePreset } = usePdfPresets();
    const p = savePreset('My Preset', PDF_SETTINGS_DEFAULTS);
    expect(p.id).toMatch(/^custom-/);
    const stored = JSON.parse(localStorage.getItem(PDF_PRESETS_STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('My Preset');
  });

  it('finds preset by id', () => {
    const { savePreset, findPreset } = usePdfPresets();
    const saved = savePreset('X', PDF_SETTINGS_DEFAULTS);
    expect(findPreset(saved.id)?.name).toBe('X');
    // Builtin name comes from i18n; just verify it exists
    expect(findPreset('builtin-report')).toBeDefined();
    expect(findPreset('builtin-report')?.name).toBeTruthy();
  });

  it('deletes a custom preset', () => {
    const { savePreset, deletePreset, customPresets } = usePdfPresets();
    const saved = savePreset('Tmp', PDF_SETTINGS_DEFAULTS);
    expect(customPresets.value).toHaveLength(1);
    deletePreset(saved.id);
    expect(customPresets.value).toHaveLength(0);
  });

  it('refuses to delete builtin preset', () => {
    const { deletePreset, findPreset } = usePdfPresets();
    deletePreset('builtin-report');
    expect(findPreset('builtin-report')).toBeDefined();
  });

  it('updates a custom preset name and settings', () => {
    const { savePreset, updatePreset, findPreset } = usePdfPresets();
    const saved = savePreset('A', PDF_SETTINGS_DEFAULTS);
    updatePreset(saved.id, 'B', { ...PDF_SETTINGS_DEFAULTS, fontSize: '12pt' });
    const found = findPreset(saved.id);
    expect(found?.name).toBe('B');
    expect(found?.settings.fontSize).toBe('12pt');
  });

  it('isBuiltinPreset returns true for builtin ids', () => {
    expect(isBuiltinPreset('builtin-report')).toBe(true);
    expect(isBuiltinPreset('custom-123')).toBe(false);
  });
});
