import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed } from 'vue';
import KeyboardSettingsTab from '../../components/KeyboardSettingsTab.vue';
import { appCommandsKey, type AppCommand } from '../../composables/useAppCommands';
import { useSettings } from '../../composables/useSettings';
const state = { settings: useSettings().settings };

describe('Keyboard Shortcuts settings', () => {
  it('records a binding, prevents conflicts, supports removal and restores defaults', async () => {
    state.settings.value.keyboardShortcuts = {};
    const definitions: AppCommand[] = [
      { id: 'bold', label: 'Bold', enabled: false, run: () => {}, accelerator: 'CmdOrCtrl+B', defaultShortcuts: ['CmdOrCtrl+B'] },
      { id: 'quick-open', label: 'Quick Open', enabled: false, run: () => {}, accelerator: 'CmdOrCtrl+P', defaultShortcuts: ['CmdOrCtrl+P'] },
    ];
    const menus = computed(() => [{ label: 'Edit', items: definitions.map(c => {
      const keys = state.settings.value.keyboardShortcuts[c.id] ?? c.defaultShortcuts!;
      return { ...c, accelerator: keys[0], aliases: keys.slice(1) };
    }) }]);
    const wrapper = mount(KeyboardSettingsTab, { attachTo: document.body, global: { provide: { [appCommandsKey as symbol]: { menus, execute: vi.fn(), enabled: () => false } } } });
    try {
      await wrapper.find('button[aria-label^="Change shortcut: Edit: Bold"]').trigger('click');
      await wrapper.find('[data-shortcut-recorder]').trigger('keydown', { key: 'p', code: 'KeyP', ctrlKey: true });
      expect(wrapper.find('[role="alert"]').text()).toContain('Quick Open');
      expect(state.settings.value.keyboardShortcuts).toEqual({});
      await wrapper.find('[data-shortcut-recorder]').trigger('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true });
      const save = wrapper.findAll('button').find(b => b.text() === 'Save')!;
      expect(save.attributes('disabled')).toBeUndefined(); await save.trigger('click');
      expect(state.settings.value.keyboardShortcuts.bold).toEqual(['CmdOrCtrl+Alt+B']);
      await wrapper.find('button[aria-label^="Remove shortcut: Edit: Bold"]').trigger('click');
      expect(state.settings.value.keyboardShortcuts.bold).toEqual([]);
      await wrapper.find('button[aria-label="Restore default: Edit: Bold"]').trigger('click');
      expect(state.settings.value.keyboardShortcuts.bold).toBeUndefined();
      expect(wrapper.text()).toContain('Ctrl+B');
    } finally { wrapper.unmount(); }
  });
});
