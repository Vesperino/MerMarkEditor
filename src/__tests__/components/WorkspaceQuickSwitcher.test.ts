import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../../composables/useWorkspace', () => ({ useWorkspace: () => ({
  openWorkspaces: ref([{ id: 'ws', name: 'Notes', rootPath: '/notes' }]),
  recentWorkspaces: ref([]), highlightedPath: ref(null),
  treesById: ref({ ws: { kind: 'folder', name: 'Notes', path: '/notes', children: [{ kind: 'file', name: 'first.md', path: '/notes/first.md' }] } }),
  findOwningWorkspace: () => ({ id: 'ws', name: 'Notes' }), setActive: vi.fn(), openWorkspace: vi.fn(),
}) }));
vi.mock('../../services/workspaceFs', () => ({ workspaceFs: { searchContent: mocks.search } }));
vi.mock('../../composables/useRecentFiles', () => ({ useRecentFiles: () => ({ recentFiles: ref([{ filePath: '/other/recent.md', fileName: 'recent.md' }]) }) }));
import WorkspaceQuickSwitcher from '../../components/WorkspaceQuickSwitcher.vue';
const mounted: ReturnType<typeof mount>[] = [];
afterEach(() => { mounted.forEach(w => w.unmount()); mounted.length = 0; vi.useRealTimers(); mocks.search.mockReset(); });
const create = (props: Record<string, unknown>) => {
  const wrapper = mount(WorkspaceQuickSwitcher, { props, global: { stubs: { Teleport: true } } }); mounted.push(wrapper); return wrapper;
};

describe('workspace picker modes', () => {
  it('Quick Open includes unsaved tabs, recent files, and workspace files without content IPC', async () => {
    vi.useFakeTimers();
    const wrapper = create({ mode: 'files', openTabs: [{ id: 'scratch', name: 'Untitled', path: null }, { id: 'saved', name: 'first.md', path: '/notes/first.md' }] });
    expect(wrapper.findAll('.qs-item')).toHaveLength(3);
    await wrapper.find('.qs-item').trigger('click');
    expect(wrapper.emitted('select-tab')).toEqual([['scratch']]);
    await wrapper.find('input').setValue('first'); await vi.advanceTimersByTimeAsync(200);
    expect(wrapper.findAll('.qs-item')).toHaveLength(1);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('dedicated content search excludes filenames and rejects results from a cleared query', async () => {
    vi.useFakeTimers();
    let finish!: (hits: unknown[]) => void;
    mocks.search.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const wrapper = create({ mode: 'content' });
    await wrapper.find('input').setValue('first'); await vi.advanceTimersByTimeAsync(200);
    expect(mocks.search).toHaveBeenCalledWith(['/notes'], 'first');
    expect(wrapper.findAll('.qs-item')).toHaveLength(0);
    await wrapper.find('input').setValue('');
    finish([{ path: '/notes/first.md', line: 1, snippet: 'first' }]); await flushPromises();
    expect(wrapper.findAll('.qs-item')).toHaveLength(0);
  });
});
