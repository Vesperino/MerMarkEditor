import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

describe('keyboard preference persistence', () => {
  it('saves overrides alongside existing settings and restores them after app restart', async () => {
    localStorage.clear(); vi.resetModules();
    const first = await import('../../composables/useSettings');
    const settings = first.useSettings().settings;
    settings.value.theme = 'dark';
    settings.value.keyboardShortcuts = { bold: ['CmdOrCtrl+Alt+B'], italic: [], 'command-palette': ['CmdOrCtrl+Shift+P', 'F1'] };
    await nextTick();
    const saved = JSON.parse(localStorage.getItem('mermark-settings')!);
    expect(saved.theme).toBe('dark'); expect(saved.keyboardShortcuts.italic).toEqual([]);
    vi.resetModules();
    const second = await import('../../composables/useSettings');
    expect(second.useSettings().settings.value.keyboardShortcuts).toEqual(saved.keyboardShortcuts);
    expect(second.useSettings().settings.value.theme).toBe('dark');
  });
});
