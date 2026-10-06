import { onMounted, onScopeDispose, ref, watch } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { Menu, MenuItem, CheckMenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { getCurrentWindow, getAllWindows } from '@tauri-apps/api/window';
import { emitTo, type UnlistenFn } from '@tauri-apps/api/event';
import type { AppCommands, AppCommand, CommandMenu } from './useAppCommands';
import { matchesShortcut, flattenCommands } from './useCommandShortcuts';
import { useMenuLabels } from '../i18n/menus';

const EVENT = 'mermark:menu-command';
const isMac = /Mac/.test(navigator.platform);
type Resource = Menu | Submenu | MenuItem | CheckMenuItem | PredefinedMenuItem;

/** Native menus belong to the focused editor window, never the print helper. */
export function useNativeMenus(commands: AppCommands) {
  const ready = ref(false);
  const labels = useMenuLabels();
  let menu: Menu | null = null;
  let resources: Resource[] = [];
  let structure = '';
  let disposed = false;
  let listening = false;
  let unlisten: UnlistenFn | undefined;
  let unfocus: UnlistenFn | undefined;
  let queue = Promise.resolve();
  const handles = new Map<string, MenuItem | CheckMenuItem>();
  const states = new Map<string, string>();
  const enabled = isTauri() && !location.pathname.includes('print');
  async function route(id: string) {
    // Resolve at invocation time: a macOS app menu can outlive its owning window.
    for (const window of await getAllWindows()) {
      if ((window.label === 'main' || window.label.startsWith('window-')) && await window.isFocused()) {
        await emitTo(window.label, EVENT, id);
        return;
      }
    }
  }
  function schedule(activate = false) {
    queue = queue.then(async () => {
      if (disposed || !enabled || !listening) return;
      const tree = commands.menus.value;
      const signature = JSON.stringify(tree, (key, value) => ['run', 'enabled', 'checked'].includes(key) ? undefined : value);
      if (structure !== signature) {
        const old = resources;
        const next: Resource[] = [];
        const track = <T extends Resource>(resource: T) => { next.push(resource); return resource; };
        handles.clear(); states.clear();
        async function build(item: AppCommand | CommandMenu): Promise<Resource> {
          if ('items' in item) {
            const items = await Promise.all(item.items.map(build));
            return track(await Submenu.new({ text: item.label, items: items as (MenuItem | Submenu)[] }));
          }
          // OS clipboard roles keep editing scoped to the actual focused field.
          const roles = { cut: 'Cut', copy: 'Copy', paste: 'Paste', 'select-all': 'SelectAll' } as const;
          if (item.id in roles) return track(await PredefinedMenuItem.new({ text: item.label, item: roles[item.id as keyof typeof roles] }));
          const opts = { id: item.id, text: item.label, enabled: item.enabled, accelerator: item.accelerator,
            action: () => { void route(item.id).catch(console.error); } };
          const handle = item.checked === undefined ? await MenuItem.new(opts) : await CheckMenuItem.new({ ...opts, checked: item.checked });
          handles.set(item.id, handle);
          return track(handle);
        }
        try {
          const treeWithPlatformMenus = tree.map(m => ({ ...m, items: [...m.items] }));
          if (isMac) {
            const edit = treeWithPlatformMenus[1];
            const settings = edit.items.find(i => 'id' in i && i.id === 'show-settings')!;
            edit.items = edit.items.filter(i => i !== settings);
            const app = track(await Submenu.new({ text: 'MerMark Editor', items: [
              await build(settings) as MenuItem,
              track(await PredefinedMenuItem.new({ item: 'Separator' })),
              track(await PredefinedMenuItem.new({ item: 'Services' })),
              track(await PredefinedMenuItem.new({ item: 'Hide' })),
              track(await PredefinedMenuItem.new({ item: 'HideOthers' })),
              track(await PredefinedMenuItem.new({ item: 'ShowAll' })),
              track(await PredefinedMenuItem.new({ item: 'Separator' })),
              track(await PredefinedMenuItem.new({ item: 'Quit' })),
            ] }));
            const windowMenu = track(await Submenu.new({ text: labels.value.window, items: [
              track(await PredefinedMenuItem.new({ item: 'Minimize' })),
              track(await PredefinedMenuItem.new({ item: 'Maximize' })),
              track(await PredefinedMenuItem.new({ item: 'Fullscreen' })),
            ] }));
            menu = track(await Menu.new({ items: [app, ...await Promise.all(treeWithPlatformMenus.map(build)) as Submenu[], windowMenu] }));
            await windowMenu.setAsWindowsMenuForNSApp();
          } else {
            menu = track(await Menu.new({ items: await Promise.all(treeWithPlatformMenus.map(build)) as Submenu[] }));
          }
          if (disposed) { await Promise.all(next.map(r => r.close())); return; }
          resources = next;
          structure = signature;
          activate = true;
        } catch (error) {
          structure = '';
          handles.clear(); states.clear();
          await Promise.allSettled(next.map(r => r.close()));
          throw error;
        }
        if (!isMac) {
          const previous = await menu.setAsWindowMenu(getCurrentWindow());
          await previous?.close();
        }
        await Promise.allSettled(old.map(r => r.close()));
        ready.value = true;
      }
      if (activate && isMac && menu && await getCurrentWindow().isFocused()) {
        const previous = await menu.setAsAppMenu();
        await previous?.close();
      }
      async function sync(items: (AppCommand | CommandMenu)[]) {
        for (const item of items) {
          if ('items' in item) { await sync(item.items); continue; }
          const handle = handles.get(item.id);
          if (!handle) continue;
          const state = `${item.enabled}:${item.checked}`;
          if (states.get(item.id) === state) continue;
          await handle.setEnabled(item.enabled);
          if (handle instanceof CheckMenuItem) await handle.setChecked(item.checked ?? false);
          states.set(item.id, state);
        }
      }
      await sync(tree);
    }).catch(error => { console.error('Native menu update failed:', error); });
  }
  // A native accelerator may be delivered to the webview instead of the menu.
  // Resolve it here so the capture handler executes it before editor keymaps.
  function shortcutCommand(event: KeyboardEvent): AppCommand | undefined {
    if (!ready.value || event.isComposing) return undefined;
    return flattenCommands(commands.menus.value).find(command => command.accelerator && matchesShortcut(event, command.accelerator));
  }
  const ownsShortcut = (event: KeyboardEvent) => !!shortcutCommand(event);
  const handleShortcut = (event: KeyboardEvent) => {
    const command = shortcutCommand(event);
    if (!command) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Native menu actions still route to the focused window. DOM keypresses
    // already belong to this window and must not be silently discarded.
    if (command.enabled) void commands.execute(command.id).catch(console.error);
  };
  onMounted(async () => {
    if (!enabled) return;
    unlisten = await getCurrentWindow().listen<string>(EVENT, event => { void commands.execute(event.payload).catch(console.error); });
    if (disposed) { unlisten(); return; }
    unfocus = await getCurrentWindow().onFocusChanged(event => { if (event.payload) schedule(true); });
    if (disposed) { unfocus(); return; }
    listening = true;
    document.addEventListener('keydown', handleShortcut, true);
    schedule(true);
  });
  watch(commands.menus, () => schedule());
  onScopeDispose(() => {
    disposed = true;
    unlisten?.(); unfocus?.();
    document.removeEventListener('keydown', handleShortcut, true);
    void queue.then(() => Promise.allSettled(resources.map(r => r.close())));
  });
  return { ready, ownsShortcut };
}
