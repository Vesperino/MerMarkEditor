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
});
