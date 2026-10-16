import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, computed } from 'vue';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { markdownToHtml } from '../../utils/markdown-converter';
import { isAllowedMarkdownLink } from '../../utils/markdown-link';
import { useFileOperations } from '../../composables/useFileOperations';
import type { UseFileOperationsOptions } from '../../composables/useFileOperations';
import { useSplitEditor } from '../../composables/useSplitEditor';
import { useCodeView } from '../../composables/useCodeView';
import { sourcePreservingMarkdown } from '../../utils/source-preserving-markdown';
import type { Tab } from '../../composables/useTabs';

const fs = vi.hoisted(() => ({ write: vi.fn(), read: vi.fn(), rename: vi.fn(), remove: vi.fn() }));
const saveDialog = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: fs.write, readTextFile: fs.read, rename: fs.rename, remove: fs.remove,
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: saveDialog }));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));

const source = readFileSync('src/__tests__/fixtures/save-churn.md', 'utf8');
const makeEditor = (markdown = source) => new Editor({
  extensions: [StarterKit.configure({ link: false }), Link.extend({ name: 'customLink' }).configure({ isAllowedUri: isAllowedMarkdownLink })],
  content: markdownToHtml(markdown),
});

function makeSaveHarness(overrides: Partial<UseFileOperationsOptions> = {}) {
  const editor = makeEditor();
  const tabs = ref<Tab[]>([{
    id: '1', filePath: '/test/handbook.md', fileName: 'handbook.md',
    originalMarkdown: source, sourceMarkdown: source,
    content: editor.getHTML(), hasChanges: true, scrollTop: 0,
  }]);
  fs.read.mockImplementation(async (path: string) => path.endsWith('.tmp') ? fs.write.mock.lastCall?.[1] : tabs.value[0].originalMarkdown);
  const operations = useFileOperations({
    tabs, activeTabId: ref('1'), activeTab: computed(() => tabs.value[0]),
    getEditorHtml: () => editor.getHTML(), setEditorContent: html => editor.commands.setContent(html),
    findTabByFilePath: () => undefined, createNewTab: () => '2', switchToTab: async () => {},
    ...overrides,
  });
  return { editor, tabs, ...operations };
}

describe('Markdown save round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.write.mockResolvedValue(undefined);
    fs.rename.mockResolvedValue(undefined);
    fs.remove.mockResolvedValue(undefined);
    saveDialog.mockResolvedValue('/test/copy.md');
  });

  it('saves only the one-character visual edit, then preserves a second edit', async () => {
    const { editor, tabs, saveFile } = makeSaveHarness();
    try {
      editor.commands.insertContentAt(1, 'X');
      await saveFile();
      const expected = source.replace('# Sample', '# XSample');
      expect(fs.write).toHaveBeenLastCalledWith('/test/handbook.md.tmp', expected);
      expect(fs.rename).toHaveBeenCalledWith('/test/handbook.md.tmp', '/test/handbook.md');
      expect(tabs.value[0].hasChanges).toBe(false);
      editor.commands.insertContentAt(2, 'Y');
      tabs.value[0].hasChanges = true;
      await saveFile();
      expect(fs.write).toHaveBeenLastCalledWith('/test/handbook.md.tmp', source.replace('# Sample', '# XYSample'));
    } finally { editor.destroy(); }
  });

  it.each(['saveFile', 'saveFileAs'] as const)('%s preserves an unchanged document exactly', async (method) => {
    const session = makeSaveHarness();
    try {
      await session[method]();
      const expectedPath = method === 'saveFileAs' ? '/test/copy.md' : '/test/handbook.md';
      expect(fs.write).toHaveBeenLastCalledWith(expectedPath + '.tmp', source);
      expect(session.tabs.value[0].originalMarkdown).toBe(source);
      expect(session.tabs.value[0].sourceMarkdown).toBe(source);
    } finally { session.editor.destroy(); }
  });

  it('uses the latest unsaved source formatting while comparing conflicts against the disk baseline', async () => {
    const onPreSaveConflict = vi.fn(async () => 'cancel' as const);
    const { editor, tabs, saveFile } = makeSaveHarness({ onPreSaveConflict });
    try {
      const latest = source.replace('Write short notes.', 'Write short\nnotes.X');
      tabs.value[0].sourceMarkdown = latest;
      editor.commands.setContent(markdownToHtml(latest));
      await saveFile();
      expect(onPreSaveConflict).not.toHaveBeenCalled();
      expect(fs.write).toHaveBeenLastCalledWith('/test/handbook.md.tmp', latest);
      expect(tabs.value[0].originalMarkdown).toBe(latest);
    } finally { editor.destroy(); }
  });

  it('passes a source-preserving candidate to conflict review and leaves both baselines intact on cancellation', async () => {
    const onPreSaveConflict = vi.fn(async () => 'cancel' as const);
    const { editor, tabs, saveFile } = makeSaveHarness({ onPreSaveConflict });
    fs.read.mockResolvedValue('changed externally');
    try {
      editor.commands.insertContentAt(1, 'X');
      await saveFile();
      expect(onPreSaveConflict).toHaveBeenCalledWith('/test/handbook.md', 'changed externally', source.replace('# Sample', '# XSample'));
      expect(fs.write).not.toHaveBeenCalled();
      expect(tabs.value[0]).toMatchObject({ originalMarkdown: source, sourceMarkdown: source, hasChanges: true });
    } finally { editor.destroy(); }
  });

  it('retains newer visual edits made during a save and includes them in the next save', async () => {
    const { editor, tabs, saveFile } = makeSaveHarness();
    try {
      editor.commands.insertContentAt(1, 'X');
      fs.write.mockImplementationOnce(async () => {
        editor.commands.insertContentAt(2, 'Y');
        tabs.value[0].content = editor.getHTML();
      });
      await saveFile();
      expect(fs.write).toHaveBeenLastCalledWith('/test/handbook.md.tmp', source.replace('# Sample', '# XSample'));
      expect(tabs.value[0]).toMatchObject({
        originalMarkdown: source.replace('# Sample', '# XSample'),
        sourceMarkdown: source, hasChanges: true,
      });
      await saveFile();
      expect(fs.write).toHaveBeenLastCalledWith('/test/handbook.md.tmp', source.replace('# Sample', '# XYSample'));
      expect(tabs.value[0].hasChanges).toBe(false);
    } finally { editor.destroy(); }
  });

  it('keeps the source baseline and unsaved state after a failed write', async () => {
    const { editor, tabs, saveFile } = makeSaveHarness();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.write.mockRejectedValueOnce(new Error('disk full'));
    try {
      editor.commands.insertContentAt(1, 'X');
      await saveFile();
      expect(tabs.value[0]).toMatchObject({ originalMarkdown: source, sourceMarkdown: source, hasChanges: true });
      expect(fs.rename).not.toHaveBeenCalled();
      expect(fs.remove).toHaveBeenCalledWith('/test/handbook.md.tmp');
    } finally { editor.destroy(); error.mockRestore(); }
  });

  it('preserves exact source on entering split view and on a preview edit', () => {
    const editor = makeEditor();
    const split = useSplitEditor();
    try {
      split.enter(editor.getHTML(), source);
      expect(split.markdownSource.value).toBe(source);
      editor.commands.insertContentAt(1, 'X');
      split.syncFromVisual(editor.getHTML());
      expect(split.markdownSource.value).toBe(source.replace('# Sample', '# XSample'));
    } finally { editor.destroy(); }
  });

  it('writes raw source edits exactly, including CRLF and trailing blank lines', async () => {
    const raw = '# Source\r\n\r\nText  \r\n\r\n';
    const tabs = ref<Tab[]>([{
      id: '1', filePath: '/test/source.md', fileName: 'source.md', originalMarkdown: source,
      content: '', hasChanges: true, scrollTop: 0,
    }]);
    fs.read.mockResolvedValue(raw);
    const { saveFile } = useFileOperations({
      tabs, activeTabId: ref('1'), activeTab: computed(() => tabs.value[0]),
      getEditorHtml: () => '', getMarkdownOverride: () => raw, setEditorContent: () => {},
      findTabByFilePath: () => undefined, createNewTab: () => '2', switchToTab: async () => {},
    });
    await saveFile();
    expect(fs.write).toHaveBeenLastCalledWith('/test/source.md.tmp', raw);
  });

  it('retains unsaved source formatting through code → visual → code', async () => {
    vi.useFakeTimers();
    const editor = makeEditor();
    let latestSource = source;
    const code = useCodeView({
      getActiveContent: () => editor.getHTML(), getSourceMarkdown: () => latestSource,
      setActiveContent: (html, markdown) => {
        latestSource = markdown!;
        editor.commands.setContent(html);
      },
      markAsChanged: () => {},
    });
    try {
      await code.toggleCodeView(editor);
      expect(code.codeContent.value).toBe(source);
      const edited = source.replace('Write short notes.', 'Write short   notes.X');
      code.onCodeContentUpdate(edited);
      await code.toggleCodeView(editor);
      expect(latestSource).toBe(edited);
      expect(sourcePreservingMarkdown(editor.getHTML(), latestSource)).toBe(edited);
      await code.toggleCodeView(editor);
      expect(code.codeContent.value).toBe(edited);
    } finally {
      editor.destroy();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
