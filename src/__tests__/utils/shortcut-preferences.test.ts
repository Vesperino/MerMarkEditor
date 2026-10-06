import { describe, expect, it } from 'vitest';
import { normalizeShortcut, normalizeShortcutOverrides, shortcutFromEvent, shortcutsOverlap, isReservedShortcut } from '../../utils/shortcut-preferences';

describe('shortcut preferences', () => {
  it('normalizes aliases, ignores malformed stored values, and preserves explicitly disabled commands', () => {
    expect(normalizeShortcut('shift+cmdorctrl+b')).toBe('CmdOrCtrl+Shift+B');
    expect(normalizeShortcut('CmdOrCtrl+/')).toBe('CmdOrCtrl+Slash');
    expect(normalizeShortcut('Shift+B')).toBeNull();
    expect(normalizeShortcut('CmdOrCtrl+Plus')).toBe('CmdOrCtrl+Plus');
    expect(normalizeShortcutOverrides({ bold: ['cmdorctrl+alt+b'], italic: [], bad: 'x', typing: ['A'], copy: ['CmdOrCtrl+C'], heading: ['Ctrl+1'], palette: ['F1', 'F1'] }))
      .toEqual({ bold: ['CmdOrCtrl+Alt+B'], italic: [], palette: ['F1'] });
  });
  it('records physical Option keys and distinguishes Command from Control on macOS', () => {
    expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: '∫', code: 'KeyB', metaKey: true, altKey: true }), true)).toBe('CmdOrCtrl+Alt+B');
    expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true }), true)).toBe('Control+Tab');
    expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }), false)).toBe('CmdOrCtrl+B');
    expect(shortcutFromEvent(new KeyboardEvent('keydown', { key: 'b' }), true)).toBeNull();
  });
  it('detects platform collisions and the two equivalent zoom-in combinations', () => {
    expect(shortcutsOverlap('CmdOrCtrl+B', 'Control+B', false)).toBe(true);
    expect(shortcutsOverlap('CmdOrCtrl+B', 'Control+B', true)).toBe(false);
    expect(shortcutsOverlap('CmdOrCtrl+Plus', 'CmdOrCtrl+Shift+Equal')).toBe(true);
    expect(shortcutsOverlap('CmdOrCtrl+Plus', 'CmdOrCtrl+Equal')).toBe(true);
    expect(isReservedShortcut('CmdOrCtrl+Q', true)).toBe(true);
    expect(isReservedShortcut('CmdOrCtrl+Shift+C', true)).toBe(false);
  });
});
