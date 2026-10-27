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

const source = readFileSync('src/__tests__/fixtures/save-churn.md', 'utf8').replace(/\r\n?/g, '\n');
const makeEditor = (markdown = source) => new Editor({
  extensions: [StarterKit.configure({ link: false }), Link.extend({ name: 'customLink' }).configure({ isAllowedUri: isAllowedMarkdownLink })],
  content: markdownToHtml(markdown),
});

function makeSaveHarness(overrides: Partial<UseFileOperationsOptions> = {}, markdown = source) {
  const editor = makeEditor(markdown);
  const tabs = ref<Tab[]>([{
    id: '1', filePath: '/test/handbook.md', fileName: 'handbook.md',
    originalMarkdown: markdown, sourceMarkdown: markdown,
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

function replaceVisualText(editor: Editor, before: string, after: string) {
  const matches: { from: number; to: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    let index = node.text.indexOf(before);
    while (index >= 0) {
      matches.push({ from: pos + index, to: pos + index + before.length });
      index = node.text.indexOf(before, index + before.length);
    }
  });
  expect(matches, `Unique visual target: ${before}`).toHaveLength(1);
  editor.view.dispatch(editor.state.tr.insertText(after, matches[0].from, matches[0].to));
}

function expectOnlyTargetedLines(before: string, actual: string, expected: string, targets: readonly string[]) {
  // Exact equality protects whitespace and line endings too. The separate line
  // assertion makes the allowed diff explicit for this editing-session contract.
  expect(actual).toBe(expected);
  const originalLines = before.split(/\r?\n/);
  const actualLines = actual.split(/\r?\n/);
  expect(actualLines).toHaveLength(originalLines.length);
  const intendedLines = new Set(targets.map(target => {
    const matches = originalLines.flatMap((line, index) => line.includes(target) ? [index + 1] : []);
    expect(matches, `Unique source line: ${target}`).toHaveLength(1);
    return matches[0];
  }));
  const changedLines = originalLines.flatMap((line, index) => line === actualLines[index] ? [] : [index + 1]);
  expect(changedLines).toEqual([...intendedLines].sort((a, b) => a - b));
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

  it.each([
    { cadence: 'one save after all edits', saveEach: false, ending: '\n' },
    { cadence: 'save after every edit', saveEach: true, ending: '\n' },
    { cadence: 'one save after all edits', saveEach: false, ending: '\r\n' },
    { cadence: 'save after every edit', saveEach: true, ending: '\r\n' },
  ])('changes only targeted lines across ten edits, reopening, and further edits ($cadence, $ending)', async ({ saveEach, ending }) => {
    const original = source.replace(/\n/g, ending);
    const session = makeSaveHarness({}, original);
    let reopened: ReturnType<typeof makeSaveHarness> | undefined;
    const edits = [
      ['Sample handbook', 'Sample field notes'],
      ['Write short notes.', 'Write clear notes.'],
      ['bold text', 'bold examples'],
      ['inline code', 'inline sample'],
      ['A record can span several source lines.', 'A record can span multiple source lines.'],
      ['presents these lines', 'shows these lines'],
      ['Revision checks', 'Review checks'],
      ['reference index', 'reference catalog'],
      ['short sections.', 'brief sections.'],
      ['two source lines.', 'three source lines.'],
    ] as const;
    let expected = original;
    const targets: string[] = [];
    try {
      for (const [before, after] of edits) {
        replaceVisualText(session.editor, before, after);
        expected = expected.replace(before, after);
        targets.push(before);
        session.tabs.value[0].hasChanges = true;
        if (saveEach) {
          await session.saveFile();
          expectOnlyTargetedLines(original, fs.write.mock.lastCall![1], expected, targets);
        }
      }
      if (!saveEach) {
        expect(fs.write).not.toHaveBeenCalled();
        await session.saveFile();
      }
      const saved = fs.write.mock.lastCall![1] as string;
      expectOnlyTargetedLines(original, saved, expected, targets);

      // Recreate the visual editor and source baseline from the saved bytes.
      // A no-edit save after reopening must introduce no extra changes.
      reopened = makeSaveHarness({}, saved);
      await reopened.saveFile();
      expectOnlyTargetedLines(saved, fs.write.mock.lastCall![1], saved, []);

      const furtherEdits = [
        ['Sample field notes', 'Sample handbook v2'],
        ['three source lines.', 'four source lines.'],
      ] as const;
      for (const [before, after] of furtherEdits) {
        replaceVisualText(reopened.editor, before, after);
        expected = expected.replace(before, after);
      }
      reopened.tabs.value[0].hasChanges = true;
      await reopened.saveFile();
      expectOnlyTargetedLines(saved, fs.write.mock.lastCall![1], expected, furtherEdits.map(([before]) => before));
    } finally {
      session.editor.destroy();
      reopened?.editor.destroy();
    }
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
