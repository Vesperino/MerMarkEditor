import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import KeyboardShortcutsModal from '../../components/KeyboardShortcutsModal.vue';

function rows(platform: string) {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  const wrapper = mount(KeyboardShortcutsModal);
  const result = wrapper.findAll('tbody tr').map((tr) => tr.findAll('td').map((td) => td.text()));
  wrapper.unmount();
  return result;
}

describe('KeyboardShortcutsModal', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists the file tree keys for Windows/Linux', () => {
    expect(rows('Win32')).toEqual(expect.arrayContaining([
      ['↑ / ↓ / Home / End', 'Move in the file tree'],
      ['Shift+↑ / Shift+↓', 'Extend the file tree selection'],
      ['→ / ←', 'Expand / collapse folder'],
      ['Enter', 'Open file or expand / collapse folder'],
      ['Space', 'Select / deselect in the file tree'],
      ['F2', 'Rename'],
    ]));
  });

  it('lists Command+Down to open and Enter to rename on macOS', () => {
    const mac = rows('MacIntel');
    expect(mac).toEqual(expect.arrayContaining([
      ['⌘+↓', 'Open file or expand / collapse folder'],
      ['Enter', 'Rename'],
    ]));
    expect(mac.map(([key]) => key)).not.toContain('F2');
  });
});
