import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import type { AppCommands, CommandMenu } from '../../composables/useAppCommands';

const mocks = vi.hoisted(() => ({
  items: [] as any[], emitTo: vi.fn(), unlisten: vi.fn(), unfocus: vi.fn(),
  focusCallback: null as ((event: { payload: boolean }) => void) | null,
  commandCallback: null as ((event: { payload: string }) => void) | null,
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: mocks.emitTo }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main', isFocused: async () => false,
    listen: async (_: string, callback: typeof mocks.commandCallback) => { mocks.commandCallback = callback; return mocks.unlisten; },
    onFocusChanged: async (callback: typeof mocks.focusCallback) => { mocks.focusCallback = callback; return mocks.unfocus; },
  }),
  getAllWindows: async () => [
    { label: 'print', isFocused: async () => true },
    { label: 'main', isFocused: async () => false },
    { label: 'window-2', isFocused: async () => true },
  ],
}));
vi.mock('@tauri-apps/api/menu', () => {
  class Resource {
    constructor(public options: any) { mocks.items.push(this); }
    static async new(options: any) { return new this(options); }
    setEnabled = vi.fn(); setChecked = vi.fn(); close = vi.fn();
    setAsWindowMenu = vi.fn(); setAsAppMenu = vi.fn(); setAsWindowsMenuForNSApp = vi.fn();
  }
  class Check extends Resource {}
  return { Menu: Resource, Submenu: Resource, MenuItem: Resource, PredefinedMenuItem: Resource, CheckMenuItem: Check };
});
import { useNativeMenus } from '../../composables/useNativeMenus';

describe('native menu adapter', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.items.length = 0; });
  it('routes menu clicks only to the focused editor window and synchronizes state without rebuilding', async () => {
    const menus = ref<CommandMenu[]>([{ label: 'File', items: [{ id: 'save-file', label: 'Save', accelerator: 'CmdOrCtrl+S', enabled: true, run: vi.fn() }] }]);
    const execute = vi.fn(async () => {});
    const commands: AppCommands = { menus, execute, enabled: () => true };
    let adapter!: ReturnType<typeof useNativeMenus>;
    const wrapper = mount(defineComponent({ setup() { adapter = useNativeMenus(commands); return () => h('div'); } }));
    await flushPromises();
    expect(adapter.ready.value).toBe(true);
    const item = mocks.items.find(i => i.options.id === 'save-file');
    item.options.action();
    await flushPromises();
    expect(mocks.emitTo).toHaveBeenCalledExactlyOnceWith('window-2', 'mermark:menu-command', 'save-file');
    const count = mocks.items.length;
    (menus.value[0].items[0] as any).enabled = false;
    // The production source is a computed tree, so replace the ref to model its update.
    menus.value = [...menus.value];
    await flushPromises();
    expect(mocks.items).toHaveLength(count);
    expect(item.setEnabled).toHaveBeenLastCalledWith(false);
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(adapter.ownsShortcut(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true }))).toBe(false);
    mocks.commandCallback?.({ payload: 'save-file' });
    expect(execute).toHaveBeenCalledExactlyOnceWith('save-file');
    wrapper.unmount(); await flushPromises();
    expect(mocks.unlisten).toHaveBeenCalled(); expect(mocks.unfocus).toHaveBeenCalled();
    expect(item.close).toHaveBeenCalled();
  });
  it.each([
    ['save-file', 'CmdOrCtrl+S', 's', false],
    ['save-file-as', 'CmdOrCtrl+Shift+S', 'S', true],
    ['show-settings', 'CmdOrCtrl+Comma', ',', false],
    ['show-shortcuts', 'CmdOrCtrl+/', '/', false],
    ['zoom-in', 'CmdOrCtrl+Plus', '+', true],
    ['toggle-code-view', 'CmdOrCtrl+Shift+V', 'V', true],
    ['undo', 'CmdOrCtrl+Z', 'z', false],
  ])('executes %s when its shortcut reaches the webview', async (id, accelerator, key, shiftKey) => {
    const menus = ref<CommandMenu[]>([{ label: 'File', items: [{ id, label: id, accelerator, enabled: true, run: vi.fn() }] }]);
    const execute = vi.fn(async () => {});
    const commands: AppCommands = { menus, execute, enabled: () => true };
    const wrapper = mount(defineComponent({ setup() { useNativeMenus(commands); return () => h('div'); } }));
    await flushPromises();
    const downstream = vi.fn();
    window.addEventListener('keydown', downstream);
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, ctrlKey: true, bubbles: true, cancelable: true }));
      await flushPromises();
      expect(execute).toHaveBeenCalledExactlyOnceWith(id);
      expect(downstream).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', downstream);
      wrapper.unmount();
      await flushPromises();
    }
  });

  it('dispatches Command shortcuts on macOS and leaves editor-only bindings alone', async () => {
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    vi.resetModules();
    const { useNativeMenus: useMacMenus } = await import('../../composables/useNativeMenus');
    const command = { id: 'show-settings', label: 'Settings', accelerator: 'CmdOrCtrl+Comma', enabled: true, run: vi.fn() };
    const menus = ref<CommandMenu[]>([{ label: 'File', items: [] }, { label: 'Edit', items: [command] }]);
    const execute = vi.fn(async () => {});
    const commands: AppCommands = { menus, execute, enabled: () => true };
    const wrapper = mount(defineComponent({ setup() { useMacMenus(commands); return () => h('div'); } }));
    try {
      await flushPromises();
      const event = new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      await flushPromises();
      expect(event.defaultPrevented).toBe(true);
      expect(execute).toHaveBeenCalledExactlyOnceWith('show-settings');
      execute.mockClear();
      for (const options of [
        { key: 'ArrowUp', altKey: true },
        { key: ',', metaKey: true, altKey: true },
        { key: ',', metaKey: true, isComposing: true },
        { key: 'c', metaKey: true },
      ]) {
        const other = new KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true });
        document.dispatchEvent(other);
        expect(other.defaultPrevented).toBe(false);
      }
      expect(execute).not.toHaveBeenCalled();
      command.enabled = false;
      menus.value = [...menus.value];
      await flushPromises();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true }));
      expect(execute).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      await flushPromises();
      platform.mockRestore();
    }
  });

});
