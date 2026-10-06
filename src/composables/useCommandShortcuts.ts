import { onMounted, onScopeDispose } from 'vue';
import { canonicalKey } from '../utils/shortcut-preferences';
import type { AppCommand, AppCommands, CommandMenu } from './useAppCommands';

export function flattenCommands(items: (AppCommand | CommandMenu)[]): AppCommand[] {
  return items.flatMap(item => 'items' in item ? flattenCommands(item.items) : [item]);
}

/** Match exact modifiers; Option on macOS changes key, so use code for letters/digits. */
export function matchesShortcut(event: KeyboardEvent, shortcut: string, isMac = /Mac/.test(navigator.platform)): boolean {
  if (event.isComposing) return false;
  const parts = shortcut.toLowerCase().split('+');
  const rawKey = parts.pop()!;
  const key = canonicalKey(rawKey)?.toLowerCase() ?? rawKey;
  const modifiers = new Set(parts);
  const primary = modifiers.has('cmdorctrl');
  if (event.metaKey !== (modifiers.has('super') || (primary && isMac)) ||
      event.ctrlKey !== (modifiers.has('control') || (primary && !isMac)) ||
      event.altKey !== modifiers.has('alt')) return false;
  let actual = event.key.toLowerCase();
  if ((event.altKey && /^(Key[A-Z]|Digit[0-9])$/.test(event.code)) || (/^[0-9]$/.test(key) && /^Digit[0-9]$/.test(event.code))) actual = event.code.replace(/^(Key|Digit)/, '').toLowerCase();
  if (key === 'plus') return (actual === '+' || actual === '=') && !modifiers.has('shift');
  if (event.shiftKey !== modifiers.has('shift')) return false;
  if (event.code && canonicalKey(event.code)?.toLowerCase() === key) return true;
  return (canonicalKey(actual)?.toLowerCase() ?? actual) === key;
}

export function useCommandShortcuts(commands: AppCommands) {
  const handle = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || document.activeElement?.closest('[data-shortcut-recorder]')) return;
    const command = flattenCommands(commands.menus.value).find(command =>
      [command.accelerator, ...(command.aliases ?? [])].some(key => key && matchesShortcut(event, key)));
    if (!command) {
      // Retired defaults must not leak through to editor keymaps (e.g. bold).
      const retired = flattenCommands(commands.menus.value).some(command =>
        command.defaultShortcuts?.some(key => matchesShortcut(event, key)));
      if (retired) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (command.enabled) void commands.execute(command.id).catch(console.error);
  };
  onMounted(() => window.addEventListener('keydown', handle, true));
  onScopeDispose(() => window.removeEventListener('keydown', handle, true));
}

export function formatShortcut(shortcut: string, isMac = /Mac/.test(navigator.platform)) {
  return shortcut.split('+').map(key => ({
    CmdOrCtrl: isMac ? '⌘' : 'Ctrl', Control: isMac ? '⌃' : 'Ctrl',
    Shift: isMac ? '⇧' : 'Shift', Alt: isMac ? '⌥' : 'Alt', Comma: ',', Plus: '+',
    Slash: '/', Minus: '-', Equal: '=', Period: '.', BracketLeft: '[', BracketRight: ']', Backquote: '`',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  }[key] ?? key)).join('+');
}

export function paletteCommands(menus: CommandMenu[]): AppCommand[] {
  const entries: AppCommand[] = [];
  const visit = (items: (AppCommand | CommandMenu)[], prefix: string, parent = '') => {
    for (const item of items) {
      if ('items' in item) visit(item.items, `${prefix}${item.label}: `, item.label);
      else entries.push({ ...item, label: item.label === parent ? prefix.slice(0, -2) : `${prefix}${item.label.startsWith(`${parent}: `) ? item.label.slice(parent.length + 2) : item.label}` });
    }
  };
  for (const menu of menus) visit(menu.items, `${menu.label}: `);
  return entries;
}
