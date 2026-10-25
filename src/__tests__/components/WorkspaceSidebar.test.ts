import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTheme: vi.fn() }),
}));

import WorkspaceSidebar from '../../components/WorkspaceSidebar.vue';
import { useWorkspace, type WorkspaceNode } from '../../composables/useWorkspace';
import { useSettings } from '../../composables/useSettings';

const file = (path: string): WorkspaceNode => ({ path, name: path.split('/').pop()!, kind: 'file' });
const folder = (path: string, children: WorkspaceNode[]): WorkspaceNode => ({
  path, name: path.split('/').pop()!, kind: 'folder', children,
});

describe('workspace tree keyboard navigation', () => {
  const ws = useWorkspace();
  let wrapper: VueWrapper;
  const scrollIntoView = vi.fn();
  const updatedRows: string[] = [];
  const countRowUpdates = {
    updated(this: { $options: { name?: string }; $props: { node?: WorkspaceNode } }) {
      if (this.$options.name === 'FileTreeNode') updatedRows.push(this.$props.node!.path);
    },
  };
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

  function row(path: string) {
    return wrapper.findAll<HTMLElement>('.tree-row').find((r) => r.attributes('data-tree-path') === path)!;
  }

  function selected(path: string) {
    expect([...ws.selectedPaths.value]).toEqual([path]);
    expect(document.activeElement).toBe(row(path).element);
  }

  async function press(key: string, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
    document.activeElement!.dispatchEvent(event);
    await nextTick();
    return event;
  }

  beforeEach(() => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const { settings } = useSettings();
    settings.value.workspace.openWorkspaces = [
      { id: 'one', rootPath: '/one', name: 'one' },
      { id: 'two', rootPath: '/two', name: 'two' },
    ];
    settings.value.workspace.activeWorkspaceId = 'one';
    settings.value.workspace.sortMode = 'name-asc';
    settings.value.workspace.sortByFolder = {};
    settings.value.workspace.sortByWorkspace = {};
    ws.treesById.value = {
      one: folder('/one', [file('/one/z.md'), folder('/one/docs', [
        file('/one/docs/b.md'), folder('/one/docs/nested', [file('/one/docs/nested/a.md')]),
      ]), folder('/one/empty', [])]),
      two: folder('/two', [file('/two/a.md')]),
    };
    ws.expandedFolders.value = new Set();
    ws.collapsedWorkspaceIds.value = new Set();
    ws.highlightedPath.value = null;
    ws.revealSignal.value = null;
    ws.dirtyPaths.value = new Set();
    ws.clearSelection();
    scrollIntoView.mockClear();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    updatedRows.length = 0;
    wrapper = mount(WorkspaceSidebar, { attachTo: document.body, global: { mixins: [countRowUpdates] } });
  });

  afterEach(() => {
    wrapper?.unmount();
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    vi.restoreAllMocks();
  });

  it('provides one tree Tab stop and focuses a clicked row', async () => {
    expect(wrapper.findAll('.tree-row[tabindex="0"]').map((r) => r.attributes('data-tree-path'))).toEqual(['/one/docs']);
    await row('/one/z.md').trigger('click');
    selected('/one/z.md');
    expect(wrapper.findAll('.tree-row[tabindex="0"]')).toHaveLength(1);
    expect(row('/one/z.md').attributes('tabindex')).toBe('0');
  });

  it('moves through sorted visible rows and stops at both ends without opening files', async () => {
    await row('/one/docs').trigger('click');
    await press('ArrowUp');
    selected('/one/docs');
    expect((await press('ArrowDown')).defaultPrevented).toBe(true);
    selected('/one/empty');
    await press('ArrowDown');
    selected('/one/z.md');
    await press('ArrowDown');
    selected('/two/a.md');
    await press('ArrowDown');
    selected('/two/a.md');
    await press('ArrowUp');
    selected('/one/z.md');
    expect(wrapper.emitted('open-file')).toBeUndefined();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('keeps mouse multi-selection intact when clicks move focus', async () => {
    await row('/one/docs').trigger('click', { ctrlKey: true });
    selected('/one/docs');
    await row('/one/empty').trigger('click', { metaKey: true });
    expect([...ws.selectedPaths.value]).toEqual(['/one/docs', '/one/empty']);
    await row('/one/empty').trigger('click', { metaKey: true });
    expect([...ws.selectedPaths.value]).toEqual(['/one/docs']);
    await row('/one/z.md').trigger('click', { shiftKey: true });
    expect([...ws.selectedPaths.value]).toEqual(['/one/empty', '/one/z.md']);
  });

  it('expands on Right, then moves into the first child in display order', async () => {
    await row('/one/docs').trigger('click');
    expect(row('/one/docs').attributes('aria-expanded')).toBe('false');
    await press('ArrowRight');
    selected('/one/docs');
    expect(row('/one/docs').attributes('aria-expanded')).toBe('true');
    await press('ArrowRight');
    selected('/one/docs/nested');
    await press('ArrowDown');
    selected('/one/docs/b.md');
    expect(row('/one/docs/b.md').attributes('aria-expanded')).toBeUndefined();
    expect(row('/one/docs/b.md').attributes('aria-level')).toBe('2');
  });

  it('collapses on Left, then moves from a closed folder or file to its parent', async () => {
    ws.expandFolder('/one/docs');
    ws.expandFolder('/one/docs/nested');
    await nextTick();
    await row('/one/docs/nested/a.md').trigger('click');
    await press('ArrowLeft');
    selected('/one/docs/nested');
    await press('ArrowLeft');
    selected('/one/docs/nested');
    expect(ws.isFolderExpanded('/one/docs/nested')).toBe(false);
    await press('ArrowLeft');
    selected('/one/docs');
    await press('ArrowLeft');
    expect(row('/one/docs/b.md')).toBeUndefined();
    await press('ArrowLeft');
    selected('/one/docs');
  });

  it('does not move Right from a file or into an empty folder', async () => {
    await row('/one/empty').trigger('click');
    await press('ArrowRight');
    await press('ArrowRight');
    selected('/one/empty');
    await row('/one/z.md').trigger('click');
    await press('ArrowRight');
    await press('ArrowLeft');
    selected('/one/z.md');
  });

  it('skips collapsed workspace sections and uses updated sorting', async () => {
    ws.collapseWorkspaceSection('two');
    ws.setWorkspaceSort('one', 'name-desc');
    await nextTick();
    await row('/one/empty').trigger('click');
    await press('ArrowDown');
    selected('/one/docs');
    await press('ArrowDown');
    selected('/one/z.md');
    await press('ArrowDown');
    selected('/one/z.md');
  });

  it('extends and shrinks a range with Shift+arrows', async () => {
    await row('/one/docs').trigger('click');
    await press('ArrowDown', { shiftKey: true });
    await press('ArrowDown', { shiftKey: true });
    expect([...ws.selectedPaths.value]).toEqual(['/one/docs', '/one/empty', '/one/z.md']);
    expect(document.activeElement).toBe(row('/one/z.md').element);
    await press('ArrowUp', { shiftKey: true });
    expect([...ws.selectedPaths.value]).toEqual(['/one/docs', '/one/empty']);
    await press('ArrowDown');
    selected('/one/z.md');
  });

  it('supports Home/End, Enter activation, and Space selection', async () => {
    await row('/one/docs').trigger('click');
    await press('End');
    selected('/two/a.md');
    await press('Enter');
    expect(wrapper.emitted('open-file')).toEqual([['/two/a.md']]);
    await press('Home');
    selected('/one/docs');
    await press('Enter');
    expect(ws.isFolderExpanded('/one/docs')).toBe(true);
    await press(' ');
    expect(ws.selectedPaths.value.size).toBe(0);
    await press(' ');
    selected('/one/docs');
  });

  it('preserves macOS Enter rename and activates with Command+Down', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    await row('/one/z.md').trigger('click');
    await press('ArrowDown', { metaKey: true });
    expect(wrapper.emitted('open-file')).toEqual([['/one/z.md']]);
    await row('/one/docs').trigger('click');
    await press('ArrowDown', { metaKey: true });
    expect(ws.isFolderExpanded('/one/docs')).toBe(true);
    await row('/one/z.md').trigger('click');
    await press('Enter');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect((document.querySelector('.wid-input') as HTMLInputElement).value).toBe('z.md');
    expect(wrapper.emitted('open-file')).toHaveLength(1);
  });

  it('keeps F2 rename on Windows/Linux', async () => {
    await row('/one/z.md').trigger('click');
    await press('F2');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect((document.querySelector('.wid-input') as HTMLInputElement).value).toBe('z.md');
    expect(wrapper.emitted('open-file')).toBeUndefined();
  });

  it('ignores prevented events and modal overlays', async () => {
    await row('/one/docs').trigger('click');
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    event.preventDefault();
    document.activeElement!.dispatchEvent(event);
    selected('/one/docs');
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    expect((await press('ArrowDown')).defaultPrevented).toBe(false);
    selected('/one/docs');
    modal.remove();
  });

  it('leaves modified shortcuts, row actions, and outside inputs alone', async () => {
    await row('/one/docs').trigger('click');
    for (const options of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }]) {
      expect((await press('ArrowDown', options)).defaultPrevented).toBe(false);
      selected('/one/docs');
    }
    const button = row('/one/docs').find<HTMLButtonElement>('button').element;
    button.focus();
    expect((await press('ArrowDown')).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(button);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect((await press('ArrowDown')).defaultPrevented).toBe(false);
    expect([...ws.selectedPaths.value]).toEqual(['/one/docs']);
    input.remove();
  });

  it('restores a visible Tab stop when a selected descendant is hidden', async () => {
    ws.expandFolder('/one/docs');
    await nextTick();
    await row('/one/docs/b.md').trigger('click');
    ws.collapseFolder('/one/docs');
    await nextTick();
    expect(wrapper.findAll('.tree-row[tabindex="0"]').map((r) => r.attributes('data-tree-path'))).toEqual(['/one/docs']);
  });

  it('re-renders only the rows that lose and gain focus', async () => {
    ws.expandFolder('/one/docs');
    ws.expandFolder('/one/docs/nested');
    await nextTick();
    await row('/one/z.md').trigger('click');
    updatedRows.length = 0;
    await press('ArrowDown');
    selected('/two/a.md');
    expect(updatedRows.sort()).toEqual(['/one/z.md', '/two/a.md']);
  });

  it('asks to delete the selection on Delete from a row, but not with modifiers', async () => {
    await row('/one/docs').trigger('click');
    await row('/one/z.md').trigger('click', { shiftKey: true });
    for (const options of [{ shiftKey: true }, { metaKey: true }]) {
      expect((await press('Delete', options)).defaultPrevented).toBe(false);
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    }
    expect((await press('Delete')).defaultPrevented).toBe(true);
    expect(document.querySelector('.wcd-message')?.textContent).toContain('3');
  });

  it('returns focus to the row when the rename dialog is cancelled', async () => {
    await row('/one/z.md').trigger('click');
    await press('F2');
    await flushPromises();
    expect(document.activeElement).toBe(document.querySelector('.wid-input'));
    await press('Escape');
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(row('/one/z.md').element);
  });

  it('exposes one tree per workspace holding only tree items and groups', async () => {
    ws.expandFolder('/one/docs');
    await nextTick();
    const trees = wrapper.findAll('[role="tree"]');
    expect(trees.map((tree) => tree.attributes('aria-label'))).toEqual(['one', 'two']);
    expect(trees.map((tree) => tree.attributes('aria-multiselectable'))).toEqual(['true', 'true']);
    expect(wrapper.findAll('[role="tree"] button:not(.tree-row button), [role="tree"] .ws-section-header')).toHaveLength(0);
    const roles = trees.flatMap((tree) => tree.findAll('[role]').map((el) => el.attributes('role')));
    expect(new Set(roles)).toEqual(new Set(['treeitem', 'group']));
    expect(wrapper.findAll('.tree-row').every((r) => r.attributes('role') === 'treeitem')).toBe(true);

    const docs = row('/one/docs');
    expect(docs.attributes('aria-expanded')).toBe('true');
    const group = wrapper.find(`#${docs.attributes('aria-owns')}`);
    expect(group.attributes('role')).toBe('group');
    expect(group.find('.tree-row').attributes('data-tree-path')).toBe('/one/docs/nested');
    expect(row('/one/z.md').attributes('aria-expanded')).toBeUndefined();

    expect(row('/one/z.md').attributes('aria-selected')).toBe('false');
    await row('/one/z.md').trigger('click');
    expect(row('/one/z.md').attributes('aria-selected')).toBe('true');
    expect(docs.attributes('aria-selected')).toBe('false');
  });
});
