import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { Tab } from '../../composables/useTabs';
import { useCloseConfirmation } from '../../composables/useCloseConfirmation';

const mocks = vi.hoisted(() => ({ write: vi.fn(), exit: vi.fn(), save: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onCloseRequested: vi.fn() }) }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile: mocks.write }));
vi.mock('@tauri-apps/plugin-process', () => ({ exit: mocks.exit }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));

function harness() {
  const tabs = ref<Tab[]>([{
    id: 'target', filePath: '/test/file.md', fileName: 'file.md', hasChanges: true,
    originalMarkdown: '# Title\r\n\r\nold\r\n', sourceMarkdown: '# Title\r\n\r\nold\r\n',
    content: '<h1>Title</h1><p>old</p>', scrollTop: 0,
  }]);
  const raw = ref('# Title\n\nnew  \n\n');
  const close = useCloseConfirmation({ tabs, activeTabId: ref('target'), getMarkdownOverride: () => raw.value,
    getEditorHtml: () => '<p></p>', switchToTab: async () => {} });
  close.currentTabToSave.value = { tab: tabs.value[0], index: 0 };
  return { tabs, raw, close };
}

describe('window-close Markdown save', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.write.mockResolvedValue(undefined); });

  it('saves raw code with the disk EOL and trailing whitespace, then advances both baselines', async () => {
    const { tabs, close } = harness();
    await close.handleSave();
    const expected = '# Title\r\n\r\nnew  \r\n\r\n';
    expect(mocks.write).toHaveBeenCalledWith('/test/file.md', expected);
    expect(tabs.value[0]).toMatchObject({ originalMarkdown: expected, sourceMarkdown: expected, hasChanges: false });
    expect(mocks.exit).toHaveBeenCalledWith(0);
  });

  it('keeps the close prompt and newer edits when the user types during the write', async () => {
    const { tabs, raw, close } = harness();
    mocks.write.mockImplementationOnce(async () => { raw.value += 'newer'; });
    await close.handleSave();
    expect(tabs.value[0].hasChanges).toBe(true);
    expect(tabs.value[0].originalMarkdown).toBe('# Title\r\n\r\nnew  \r\n\r\n');
    expect(tabs.value[0].sourceMarkdown).toBe('# Title\r\n\r\nold\r\n');
    expect(mocks.exit).not.toHaveBeenCalled();
    expect(close.currentTabToSave.value).not.toBeNull();
  });

  it('does not advance either baseline or close the window after a failed write', async () => {
    const { tabs, close } = harness();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.write.mockRejectedValueOnce(new Error('disk full'));
    await close.handleSave();
    expect(tabs.value[0]).toMatchObject({ originalMarkdown: '# Title\r\n\r\nold\r\n', sourceMarkdown: '# Title\r\n\r\nold\r\n', hasChanges: true });
    expect(mocks.exit).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
