import { onMounted, onScopeDispose } from 'vue';
import type { AppCommand, AppCommands, CommandMenu } from './useAppCommands';

export function flattenCommands(items: (AppCommand | CommandMenu)[]): AppCommand[] {
  return items.flatMap(item => 'items' in item ? flattenCommands(item.items) : [item]);
}

/** Match exact modifiers; Option on macOS changes key, so use code for letters/digits. */
export function matchesShortcut(event: KeyboardEvent, shortcut: string, isMac = /Mac/.test(navigator.platform)): boolean {
  if (event.isComposing) return false;
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop()!;
  const modifiers = new Set(parts);
  const primary = modifiers.has('cmdorctrl');
  if (event.metaKey !== (modifiers.has('super') || (primary && isMac)) ||
      event.ctrlKey !== (modifiers.has('control') || (primary && !isMac)) ||
      event.altKey !== modifiers.has('alt')) return false;
  let actual = event.key.toLowerCase();
  if (event.altKey && /^(Key[A-Z]|Digit[0-9])$/.test(event.code)) actual = event.code.replace(/^(Key|Digit)/, '').toLowerCase();
  if (key === 'plus') return (actual === '+' || actual === '=') && !modifiers.has('shift');
  if (event.shiftKey !== modifiers.has('shift')) return false;
  return actual === ({ comma: ',', arrowleft: 'arrowleft', arrowright: 'arrowright' }[key] ?? key);
}

export function useCommandShortcuts(commands: AppCommands) {
  const handle = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    const command = flattenCommands(commands.menus.value).find(command =>
      [command.accelerator, ...(command.aliases ?? [])].some(key => key && matchesShortcut(event, key)));
    if (!command) return;
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
  }[key] ?? key)).join('+');
}

export function paletteCommands(menus: CommandMenu[]): AppCommand[] {
  const entries: AppCommand[] = [];
  const visit = (items: (AppCommand | CommandMenu)[], prefix: string) => {
    for (const item of items) {
      if ('items' in item) visit(item.items, `${prefix}${item.label}: `);
      else entries.push({ ...item, label: `${prefix}${item.label}` });
    }
  };
  for (const menu of menus) visit(menu.items, `${menu.label}: `);
  return entries;
}
