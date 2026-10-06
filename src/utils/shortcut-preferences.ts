const keyAliases: Record<string, string> = {
  ',': 'Comma', '/': 'Slash', '-': 'Minus', '=': 'Equal', '.': 'Period', ';': 'Semicolon',
  "'": 'Quote', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', '`': 'Backquote', ' ': 'Space',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
};
const namedKeys = ['Comma', 'Slash', 'Minus', 'Equal', 'Plus', 'Period', 'Semicolon', 'Quote', 'BracketLeft', 'BracketRight', 'Backslash', 'Backquote', 'Space', 'Tab', 'Enter', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const modifiers = ['CmdOrCtrl', 'Super', 'Control', 'Alt', 'Shift'];
export function canonicalKey(key: string): string | null {
  return keyAliases[key.toLowerCase()] ?? namedKeys.find(k => k.toLowerCase() === key.toLowerCase()) ??
    (/^[a-z0-9]$/i.test(key) || /^F([1-9]|1[0-2])$/i.test(key) ? key.toUpperCase() : null);
}
export function normalizeShortcut(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  const parts = value.split('+');
  const key = canonicalKey(parts.pop() ?? '');
  const mods = parts.map(p => modifiers.find(m => m.toLowerCase() === p.toLowerCase()));
  if (!key || mods.some(m => !m) || new Set(mods).size !== mods.length) return null;
  if (!mods.some(mod => mod !== 'Shift') && !/^F\d+$/.test(key)) return null; // preserve ordinary typing/navigation
  if (mods.includes('CmdOrCtrl') && mods.includes('Super')) return null;
  return [...modifiers.filter(m => mods.includes(m)), key].join('+');
}
export function normalizeShortcutOverrides(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, keys]) => {
    if (!Array.isArray(keys) || keys.length > 8 || id.length > 1024) return [];
    const normalized = keys.map(normalizeShortcut);
    if (normalized.some(key => !key || isReservedShortcut(key))) return [];
    return [[id, [...new Set(normalized as string[])]]];
  }));
}
export function shortcutFromEvent(event: KeyboardEvent, isMac = /Mac/.test(navigator.platform)): string | null {
  if (event.isComposing || ['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return null;
  const key = /^(Key[A-Z]|Digit[0-9])$/.test(event.code) ? event.code.replace(/^(Key|Digit)/, '')
    : canonicalKey(event.code) ?? canonicalKey(event.key);
  if (!key) return null;
  const mods = [event.metaKey ? isMac ? 'CmdOrCtrl' : 'Super' : '', event.ctrlKey ? isMac ? 'Control' : 'CmdOrCtrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : ''].filter(Boolean);
  return normalizeShortcut([...mods, key].join('+'));
}
function identities(shortcut: string, isMac: boolean) {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return [];
  const parts = normalized.replace('CmdOrCtrl', isMac ? 'Super' : 'Control').split('+');
  const key = parts.pop()!;
  const mods = [...new Set(parts)].sort();
  if (key === 'Plus') return [ [...mods, 'Equal'].join('+'), [...new Set([...mods, 'Shift'])].sort().concat('Equal').join('+') ];
  return [[...mods, key].join('+')];
}
export function shortcutsOverlap(a: string, b: string, isMac = /Mac/.test(navigator.platform)) {
  return identities(a, isMac).some(key => identities(b, isMac).includes(key));
}
/** Clipboard and system window shortcuts remain under OS control. */
export function isReservedShortcut(shortcut: string, isMac = /Mac/.test(navigator.platform)) {
  const reserved = ['A', 'C', 'X', 'V', ...(isMac ? ['Q', 'H', 'M', 'Space'] : [])].map(key => `CmdOrCtrl+${key}`);
  reserved.push(...(isMac ? ['CmdOrCtrl+Alt+H', 'CmdOrCtrl+Alt+M'] : ['Alt+F4']));
  return reserved.some(key => shortcutsOverlap(shortcut, key, isMac));
}
