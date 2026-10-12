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
  class Predefined extends Resource {}
  return { Menu: Resource, Submenu: Resource, MenuItem: Resource, PredefinedMenuItem: Predefined, CheckMenuItem: Check };
});

async function load(platform: string) {
  const spy = vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  vi.resetModules();
  const module = await import('../../composables/useNativeMenus');
  return { useNativeMenus: module.useNativeMenus, restore: () => spy.mockRestore() };
}

describe('native menu adapter', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.items.length = 0; });

  it('runs Windows/Linux menu clicks in the owning window and synchronizes state without rebuilding', async () => {
    const { useNativeMenus, restore } = await load('Win32');
    const menus = ref<CommandMenu[]>([{ label: 'File', items: [{ id: 'save-file', label: 'Save', accelerator: 'CmdOrCtrl+S', enabled: true, run: vi.fn() }] }]);
    const execute = vi.fn(async () => {});
    const commands: AppCommands = { menus, execute, enabled: () => true };
    let adapter!: { ready: { value: boolean } };
    const wrapper = mount(defineComponent({ setup() { adapter = useNativeMenus(commands); return () => h('div'); } }));
    try {
      await flushPromises();
      expect(adapter.ready.value).toBe(true);
      const item = mocks.items.find(i => i.options.id === 'save-file');
      item.options.action();
      await flushPromises();
      expect(execute).toHaveBeenCalledExactlyOnceWith('save-file');
      expect(mocks.emitTo).not.toHaveBeenCalled();
      const count = mocks.items.length;
      (menus.value[0].items[0] as any).enabled = false;
      menus.value = [...menus.value];
      await flushPromises();
      expect(mocks.items).toHaveLength(count);
      expect(item.setEnabled).toHaveBeenLastCalledWith(false);
      mocks.commandCallback?.({ payload: 'save-file' });
      expect(execute).toHaveBeenCalledTimes(2);
    } finally {
      wrapper.unmount(); await flushPromises(); restore();
    }
    expect(mocks.unlisten).toHaveBeenCalled(); expect(mocks.unfocus).toHaveBeenCalled();
  });

  it('routes the shared macOS app menu to the focused editor window', async () => {
    const { useNativeMenus, restore } = await load('MacIntel');
    const menus = ref<CommandMenu[]>([
      { label: 'File', items: [{ id: 'save-file', label: 'Save', accelerator: 'CmdOrCtrl+S', enabled: true, run: vi.fn() }] },
      { label: 'Edit', items: [{ id: 'show-settings', label: 'Settings', enabled: true, run: vi.fn() }] },
    ]);
    const execute = vi.fn(async () => {});
    const wrapper = mount(defineComponent({ setup() { useNativeMenus({ menus, execute, enabled: () => true }); return () => h('div'); } }));
    try {
      await flushPromises();
      mocks.items.find(i => i.options.id === 'save-file').options.action();
      await flushPromises();
      expect(mocks.emitTo).toHaveBeenCalledExactlyOnceWith('window-2', 'mermark:menu-command', 'save-file');
      expect(execute).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount(); await flushPromises(); restore();
    }
  });

  it('gives zoom-in a parsable accelerator and keeps Linux clipboard items in the page', async () => {
    const { useNativeMenus, restore } = await load('Linux x86_64');
    const menus = ref<CommandMenu[]>([{ label: 'Edit', items: [
      { id: 'copy', label: 'Copy', accelerator: 'CmdOrCtrl+C', enabled: true, run: vi.fn() },
      { id: 'zoom-in', label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', enabled: true, run: vi.fn() },
    ] }]);
    const execute = vi.fn(async () => {});
    const wrapper = mount(defineComponent({ setup() { useNativeMenus({ menus, execute, enabled: () => true }); return () => h('div'); } }));
    try {
      await flushPromises();
      const copy = mocks.items.find(i => i.options.id === 'copy');
      expect(copy.constructor.name).not.toBe('Predefined');
      expect(copy.options.accelerator).toBeUndefined();
      expect(mocks.items.find(i => i.options.id === 'zoom-in').options.accelerator).toBe('CmdOrCtrl+=');
    } finally {
      wrapper.unmount(); await flushPromises(); restore();
    }
  });
});
