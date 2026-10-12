import { onMounted, onScopeDispose } from 'vue';
import { canonicalKey, eventKeyNames, isAltGraph, isSymbolKey } from '../utils/shortcut-preferences';
import type { AppCommand, AppCommands, CommandMenu } from './useAppCommands';

export function flattenCommands(items: (AppCommand | CommandMenu)[]): AppCommand[] {
  return items.flatMap(item => 'items' in item ? flattenCommands(item.items) : [item]);
}

/** Match exact modifiers against the layout's character, falling back to the physical key only when needed. */
export function matchesShortcut(event: KeyboardEvent, shortcut: string, isMac = /Mac/.test(navigator.platform)): boolean {
  if (event.isComposing || isAltGraph(event, isMac)) return false;
  const parts = shortcut.split('+');
  const key = canonicalKey(parts.pop()!);
  if (!key) return false;
  const modifiers = new Set(parts.map(part => part.toLowerCase()));
  const primary = modifiers.has('cmdorctrl');
  if (event.metaKey !== (modifiers.has('super') || (primary && isMac)) ||
      event.ctrlKey !== (modifiers.has('control') || (primary && !isMac)) ||
      event.altKey !== modifiers.has('alt')) return false;
  const shift = modifiers.has('shift');
  const names = eventKeyNames(event);
  if (key === 'Plus') return !shift && (names.some(n => n.key === 'Plus' || n.key === 'Equal') || event.code === 'NumpadAdd');
  // Layouts that need Shift for a symbol (German "/", French digits) still match the unshifted shortcut.
  return names.some(n => n.key === key && (event.shiftKey === shift || (n.produced && !shift && isSymbolKey(key))));
}

/** Commands that mirror an editor keymap; when disabled, the keypress belongs to that editor. */
const editorOwned = (id: string) => id.startsWith('heading:') || ['bold', 'italic', 'strikethrough', 'inline-code', 'bullet-list',
  'ordered-list', 'task-list', 'blockquote', 'code-block', 'link', 'toggle-comment', 'select-next-occurrence', 'undo', 'redo'].includes(id);
const repeatable = new Set(['zoom-in', 'zoom-out', 'undo', 'redo', 'find-next', 'find-previous', 'next-tab', 'previous-tab', 'select-next-occurrence']);

export function useCommandShortcuts(commands: AppCommands) {
  const handle = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || document.activeElement?.closest('[data-shortcut-recorder]')) return;
    const all = flattenCommands(commands.menus.value);
    const matches = all.filter(command => [command.accelerator, ...(command.aliases ?? [])].some(key => key && matchesShortcut(event, key)));
    const command = matches.find(command => command.enabled);
    const block = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (!command) {
      // WebView defaults (reload, print, find, zoom) must not run in place of a disabled command.
      if (matches.length) { if (!matches.every(match => editorOwned(match.id))) block(); return; }
      // Retired defaults must not leak through to editor keymaps (e.g. bold).
      if (all.some(command => command.defaultShortcuts?.some(key => matchesShortcut(event, key)))) block();
      return;
    }
    block();
    if (event.repeat && !repeatable.has(command.id)) return;
    void commands.execute(command.id).catch(console.error);
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
