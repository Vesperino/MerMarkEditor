import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { matchesShortcut, useCommandShortcuts } from '../../composables/useCommandShortcuts';
import type { AppCommands } from '../../composables/useAppCommands';

describe('command shortcuts', () => {
  it('matches exact platform modifiers, physical Option digits, and Control tab on macOS', () => {
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: 'p', metaKey: true }), 'CmdOrCtrl+P', true)).toBe(true);
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }), 'CmdOrCtrl+P', true)).toBe(false);
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }), 'CmdOrCtrl+P', false)).toBe(true);
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: '¡', code: 'Digit1', metaKey: true, altKey: true }), 'CmdOrCtrl+Alt+1', true)).toBe(true);
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true }), 'Control+Tab', true)).toBe(true);
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: 'Tab', metaKey: true }), 'Control+Tab', true)).toBe(false);
    for (const extra of [{ altKey: true }, { shiftKey: true }, { metaKey: true }, { isComposing: true }]) {
      expect(matchesShortcut(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, ...extra }), 'CmdOrCtrl+P', false)).toBe(false);
    }
  });

  it('routes primary and alias keys before editor keymaps, blocks disabled commands, and cleans up', () => {
    const command = { id: 'palette', label: 'Palette', enabled: true, accelerator: 'CmdOrCtrl+Shift+P', aliases: ['F1'], run: vi.fn() };
    const execute = vi.fn(async () => {});
    const commands: AppCommands = { menus: ref([{ label: 'View', items: [command] }]), execute, enabled: () => true };
    const wrapper = mount(defineComponent({ setup() { useCommandShortcuts(commands); return () => h('input'); } }), { attachTo: document.body });
    const input = wrapper.element;
    const editorKeymap = vi.fn(); input.addEventListener('keydown', editorKeymap);
    const fire = (options: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options });
      input.dispatchEvent(event); return event;
    };
    expect(fire({ key: 'P', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(fire({ key: 'F1' }).defaultPrevented).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(editorKeymap).not.toHaveBeenCalled();
    (commands.menus.value[0].items[0] as typeof command).enabled = false;
    expect(fire({ key: 'F1' }).defaultPrevented).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(fire({ key: 'p', ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(fire({ key: 'F1', isComposing: true }).defaultPrevented).toBe(false);
    wrapper.unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('blocks retired editor defaults after a remap and bypasses the shortcut recorder', () => {
    const execute = vi.fn(async () => {});
    const menus = ref([{ label: 'Format', items: [{ id: 'bold', label: 'Bold', enabled: true,
      accelerator: 'CmdOrCtrl+Alt+B', defaultShortcuts: ['CmdOrCtrl+B'], run: vi.fn() }] }]);
    const wrapper = mount(defineComponent({ setup() {
      useCommandShortcuts({ menus, execute, enabled: () => true });
      return () => h('input');
    } }), { attachTo: document.body });
    try {
      const old = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true });
      wrapper.element.dispatchEvent(old);
      expect(old.defaultPrevented).toBe(true); expect(execute).not.toHaveBeenCalled();
      const current = new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true, bubbles: true, cancelable: true });
      wrapper.element.dispatchEvent(current); expect(execute).toHaveBeenCalledExactlyOnceWith('bold');
      wrapper.element.setAttribute('data-shortcut-recorder', ''); (wrapper.element as HTMLInputElement).focus();
      const recording = new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true, bubbles: true, cancelable: true });
      wrapper.element.dispatchEvent(recording); expect(recording.defaultPrevented).toBe(false);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });

  it('ignores AltGr characters and follows the active keyboard layout', () => {
    const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
    // Polish AltGr+C types "ć"; German AltGr+8 types "[" (Windows reports AltGr as Ctrl+Alt).
    expect(matchesShortcut(key({ key: 'ć', code: 'KeyC', ctrlKey: true, altKey: true }), 'CmdOrCtrl+Alt+C', false)).toBe(false);
    expect(matchesShortcut(key({ key: '[', code: 'Digit8', ctrlKey: true, altKey: true }), 'CmdOrCtrl+Alt+8', false)).toBe(false);
    expect(matchesShortcut(key({ key: 'c', code: 'KeyC', ctrlKey: true, altKey: true }), 'CmdOrCtrl+Alt+C', false)).toBe(true);
    // German: "-" sits on the US Slash key and "/" needs Shift+7.
    expect(matchesShortcut(key({ key: '-', code: 'Slash', ctrlKey: true }), 'CmdOrCtrl+/', false)).toBe(false);
    expect(matchesShortcut(key({ key: '-', code: 'Slash', ctrlKey: true }), 'CmdOrCtrl+-', false)).toBe(true);
    expect(matchesShortcut(key({ key: '/', code: 'Digit7', ctrlKey: true, shiftKey: true }), 'CmdOrCtrl+/', false)).toBe(true);
    expect(matchesShortcut(key({ key: '+', code: 'BracketRight', ctrlKey: true }), 'CmdOrCtrl+Plus', false)).toBe(true);
    // US Shift+digit and AZERTY digits still reach digit shortcuts.
    expect(matchesShortcut(key({ key: '&', code: 'Digit7', ctrlKey: true, shiftKey: true }), 'CmdOrCtrl+Shift+7', false)).toBe(true);
    expect(matchesShortcut(key({ key: 'à', code: 'Digit0', ctrlKey: true }), 'CmdOrCtrl+0', false)).toBe(true);
    // Cyrillic letters fall back to the physical key; Dvorak letters do not.
    expect(matchesShortcut(key({ key: 'ы', code: 'KeyS', ctrlKey: true }), 'CmdOrCtrl+S', false)).toBe(true);
    expect(matchesShortcut(key({ key: 's', code: 'KeyO', ctrlKey: true }), 'CmdOrCtrl+O', false)).toBe(false);
  });

  it('lets disabled editor commands reach the editor, prefers enabled duplicates, and skips repeats', () => {
    const execute = vi.fn(async () => {});
    const comment = { id: 'toggle-comment', label: 'Comment', enabled: false, accelerator: 'CmdOrCtrl+/', run: vi.fn() };
    const help = { id: 'show-shortcuts', label: 'Help', enabled: true, accelerator: 'CmdOrCtrl+/', run: vi.fn() };
    const bold = { id: 'bold', label: 'Bold', enabled: false, accelerator: 'CmdOrCtrl+B', run: vi.fn() };
    const reload = { id: 'reload-file', label: 'Reload', enabled: false, accelerator: 'CmdOrCtrl+R', run: vi.fn() };
    const close = { id: 'close-tab', label: 'Close', enabled: true, accelerator: 'CmdOrCtrl+W', run: vi.fn() };
    const menus = ref([{ label: 'All', items: [comment, help, bold, reload, close] }]);
    const wrapper = mount(defineComponent({ setup() { useCommandShortcuts({ menus, execute, enabled: () => true }); return () => h('input'); } }), { attachTo: document.body });
    const fire = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, ...init });
      wrapper.element.dispatchEvent(event); return event;
    };
    try {
      expect(fire({ key: '/' }).defaultPrevented).toBe(true);
      expect(execute).toHaveBeenLastCalledWith('show-shortcuts');
      execute.mockClear();
      expect(fire({ key: 'b' }).defaultPrevented).toBe(false);
      expect(fire({ key: 'r' }).defaultPrevented).toBe(true);
      expect(fire({ key: 'w', repeat: true }).defaultPrevented).toBe(true);
      expect(execute).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

});
