import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, computed } from 'vue';
import type { Tab } from '../../composables/useTabs';

// ============================================================
// Mocks — must be hoisted above imports
// ============================================================

const mockReadTextFile = vi.fn();
const mockWriteTextFile = vi.fn();
const mockRename = vi.fn();
const mockRemove = vi.fn();
const mockOpenDialog = vi.fn();
const mockSaveDialog = vi.fn();
const mockOpenShell = vi.fn();
const mockGetCurrentWindow = vi.fn(() => ({
  isMaximized: vi.fn(async () => false),
  maximize: vi.fn(async () => {}),
  unmaximize: vi.fn(async () => {}),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (...args: unknown[]) => mockReadTextFile(...args),
  writeTextFile: (...args: unknown[]) => mockWriteTextFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpenDialog(...args),
  save: (...args: unknown[]) => mockSaveDialog(...args),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: (...args: unknown[]) => mockOpenShell(...args),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mockGetCurrentWindow(),
}));

// Spread the real module so `generateSlug` stays the genuine implementation —
// the anchor fallback compares against it, and a hand-copied stub would keep
// passing after the real slug rules change.
vi.mock('../../utils/markdown-converter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/markdown-converter')>()),
  htmlToMarkdown: vi.fn((html: string) => `md:${html}`),
  markdownToHtml: vi.fn((md: string) => `<p>${md}</p>`),
  detectLineEnding: vi.fn(() => '\n'),
  applyLineEnding: vi.fn((content: string) => content),
}));

vi.mock('../../constants', () => ({
  EMPTY_TAB_CONTENT: '<p></p>',
  DEFAULT_FILE_NAME: 'dokument.md',
  DOM_SELECTORS: {
    EDITOR_CONTAINER: '.editor-container',
    ACTIVE_EDITOR_CONTAINER: '.editor-pane.active .editor-container',
  },
  TIMING: { MAXIMIZE_ANIMATION_DELAY: 0 },
  LARGE_FILE_CHAR_THRESHOLD: 1_000_000,
}));

import { useFileOperations } from '../../composables/useFileOperations';
import { htmlToMarkdown, markdownToHtml } from '../../utils/markdown-converter';

// ============================================================
// Helpers
// ============================================================

const makeTab = (overrides: Partial<Tab> = {}): Tab => ({
  id: 'tab-1',
  filePath: '/test/file.md',
  fileName: 'file.md',
  content: '<p>hello</p>',
  hasChanges: true,
  scrollTop: 0,
  originalMarkdown: '# hello',
  ...overrides,
});

const makeOptions = (tabOverrides: Partial<Tab> = {}, extraOptions: Record<string, unknown> = {}) => {
  const tab = makeTab(tabOverrides);
  const tabs = ref<Tab[]>([tab]);
  const activeTabId = ref(tab.id);
  const activeTab = computed(() => tabs.value[0]);
  const getEditorHtml = vi.fn(() => tab.content);
  const setEditorContent = vi.fn();
  const createNewTab = vi.fn(() => 'new-tab-id');
  const switchToTab = vi.fn(async () => {});
  const findTabByFilePath = vi.fn(() => undefined);

  return {
    options: {
      tabs,
      activeTabId,
      activeTab,
      findTabByFilePath,
      createNewTab,
      switchToTab,
      getEditorHtml,
      setEditorContent,
      ...extraOptions,
    },
    tabs,
    tab,
    getEditorHtml,
    setEditorContent,
    createNewTab,
    switchToTab,
    findTabByFilePath,
  };
};

// ============================================================
// Tests
// ============================================================

describe('useFileOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteTextFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
    mockReadTextFile.mockResolvedValue('# hello');
  });

  // ----------------------------------------------------------
  // atomicWriteFile (via saveFile)
  // ----------------------------------------------------------

  describe('atomicWriteFile', () => {
    it('writes to .tmp file first, then renames to final path', async () => {
      // readTextFile is called twice: once for .tmp verification, once for pre-save conflict check
      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return '# hello'; // disk content matches originalMarkdown → no conflict
      });

      const { options } = makeOptions();
      const { saveFile } = useFileOperations(options);

      await saveFile();

      const tmpPath = '/test/file.md.tmp';
      expect(mockWriteTextFile).toHaveBeenCalledWith(tmpPath, expect.any(String));
      expect(mockRename).toHaveBeenCalledWith(tmpPath, '/test/file.md');
    });

    it('removes .tmp file when rename succeeds (no leftover temp)', async () => {
      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return '# hello';
      });

      const { options } = makeOptions();
      const { saveFile } = useFileOperations(options);

      await saveFile();

      // remove should NOT be called on success path
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('removes .tmp file and rethrows when writeTextFile fails', async () => {
      mockWriteTextFile.mockRejectedValue(new Error('disk full'));
      const markSaveEnd = vi.fn();

      const { options, tabs } = makeOptions();
      const { saveFile } = useFileOperations({ ...options, markSaveEnd });

      // saveFile swallows errors internally (console.error) — verify .tmp cleanup
      await saveFile();

      expect(mockRemove).toHaveBeenCalledWith('/test/file.md.tmp');
      // tab should remain unchanged (hasChanges still true)
      expect(tabs.value[0].hasChanges).toBe(true);
    });

    it('removes .tmp and throws when verification fails (written !== content)', async () => {
      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'CORRUPTED_CONTENT';
        return '# hello';
      });

      const { options, tabs } = makeOptions();
      const { saveFile } = useFileOperations(options);

      await saveFile();

      // .tmp should be cleaned up on verification failure
      expect(mockRemove).toHaveBeenCalledWith('/test/file.md.tmp');
      // tab should remain unsaved
      expect(tabs.value[0].hasChanges).toBe(true);
    });

    it('calls markSaveStart before write and markSaveEnd after rename', async () => {
      const calls: string[] = [];
      const markSaveStart = vi.fn(() => calls.push('start'));
      const markSaveEnd = vi.fn(() => calls.push('end'));

      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return '# hello';
      });

      const { options } = makeOptions();
      const { saveFile } = useFileOperations({ ...options, markSaveStart, markSaveEnd });

      await saveFile();

      expect(calls).toEqual(['start', 'end']);
      expect(markSaveStart).toHaveBeenCalledWith('/test/file.md');
      expect(markSaveEnd).toHaveBeenCalledWith('/test/file.md', expect.any(String));
    });
  });

  // ----------------------------------------------------------
  // Code view fix — getMarkdownOverride
  // ----------------------------------------------------------

  describe('getMarkdownOverride (code view save)', () => {
    it('uses raw markdown from override instead of converting editor HTML', async () => {
      const rawMarkdown = '# Raw from code editor\n\nNo conversion needed.';
      const getMarkdownOverride = vi.fn(() => rawMarkdown);

      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return rawMarkdown;
        return '# hello'; // disk matches → no conflict
      });

      const { options } = makeOptions();
      const { saveFile } = useFileOperations({ ...options, getMarkdownOverride });

      await saveFile();

      // Should write the raw override content, NOT the HTML→markdown conversion
      expect(mockWriteTextFile).toHaveBeenCalledWith('/test/file.md.tmp', rawMarkdown);
      expect(htmlToMarkdown).not.toHaveBeenCalled();
    });

    it('falls back to HTML→markdown when override returns null (visual mode)', async () => {
      const getMarkdownOverride = vi.fn(() => null);

      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return '# hello';
      });

      const { options } = makeOptions();
      const { saveFile } = useFileOperations({ ...options, getMarkdownOverride });

      await saveFile();

      expect(htmlToMarkdown).toHaveBeenCalledWith('<p>hello</p>');
    });

    it('updates tab.originalMarkdown with override content after save', async () => {
      const rawMarkdown = '# Saved from code view';
      const getMarkdownOverride = vi.fn(() => rawMarkdown);

      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return rawMarkdown;
        return '# hello';
      });

      const { options, tabs } = makeOptions();
      const { saveFile } = useFileOperations({ ...options, getMarkdownOverride });

      await saveFile();

      expect(tabs.value[0].originalMarkdown).toBe(rawMarkdown);
      expect(tabs.value[0].hasChanges).toBe(false);
    });

    it('does NOT update tab.content when saving from code view (html is null)', async () => {
      const rawMarkdown = '# code view content';
      const getMarkdownOverride = vi.fn(() => rawMarkdown);
      const originalContent = '<p>hello</p>';

      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return rawMarkdown;
        return '# hello';
      });

      const { options, tabs } = makeOptions({ content: originalContent });
      const { saveFile } = useFileOperations({ ...options, getMarkdownOverride });

      await saveFile();

      // content (cached HTML) should remain unchanged — code view doesn't produce fresh HTML
      expect(tabs.value[0].content).toBe(originalContent);
    });
  });

  // ----------------------------------------------------------
  // Pre-save conflict detection
  // ----------------------------------------------------------

  describe('checkPreSaveConflict', () => {
    it('skips save when conflict detected and user cancels', async () => {
      // Disk content differs from originalMarkdown → conflict
      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return '# DIFFERENT disk content'; // conflict!
      });

      const onPreSaveConflict = vi.fn(async () => 'cancel' as const);
      const { options, tabs } = makeOptions();
      const { saveFile } = useFileOperations({ ...options, onPreSaveConflict });

      await saveFile();

      expect(onPreSaveConflict).toHaveBeenCalledWith('/test/file.md', '# DIFFERENT disk content', 'md:<p>hello</p>');
      // File should NOT be written since user cancelled
      expect(mockWriteTextFile).not.toHaveBeenCalled();
      expect(tabs.value[0].hasChanges).toBe(true);
    });

    it('proceeds with save when conflict detected but user confirms', async () => {
      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return '# DIFFERENT disk content'; // conflict
      });

      const onPreSaveConflict = vi.fn(async () => 'save' as const);
      const { options, tabs } = makeOptions();
      const { saveFile } = useFileOperations({ ...options, onPreSaveConflict });

      await saveFile();

      expect(onPreSaveConflict).toHaveBeenCalled();
      expect(mockWriteTextFile).toHaveBeenCalled();
      expect(tabs.value[0].hasChanges).toBe(false);
    });

    it('does not call onPreSaveConflict when disk matches originalMarkdown', async () => {
      // Disk content matches originalMarkdown → no conflict
      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return '# hello'; // matches originalMarkdown
      });

      const onPreSaveConflict = vi.fn(async () => 'save' as const);
      const { options } = makeOptions({ originalMarkdown: '# hello' });
      const { saveFile } = useFileOperations({ ...options, onPreSaveConflict });

      await saveFile();

      expect(onPreSaveConflict).not.toHaveBeenCalled();
    });

    it('does not call onPreSaveConflict when tab has no originalMarkdown (new file)', async () => {
      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return 'some disk content';
      });

      const onPreSaveConflict = vi.fn(async () => 'cancel' as const);
      const { options } = makeOptions({ originalMarkdown: null });
      const { saveFile } = useFileOperations({ ...options, onPreSaveConflict });

      await saveFile();

      expect(onPreSaveConflict).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // saveFile — basic flow
  // ----------------------------------------------------------

  describe('saveFile', () => {
    it('skips save when file exists and has no changes', async () => {
      const { options } = makeOptions({ hasChanges: false });
      const { saveFile } = useFileOperations(options);

      await saveFile();

      expect(mockWriteTextFile).not.toHaveBeenCalled();
    });

    it('shows save dialog when file has no path yet', async () => {
      mockSaveDialog.mockResolvedValue('/new/path/file.md');
      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return ''; // no disk conflict
      });

      const { options } = makeOptions({ filePath: null });
      const { saveFile } = useFileOperations(options);

      await saveFile();

      expect(mockSaveDialog).toHaveBeenCalled();
      expect(mockWriteTextFile).toHaveBeenCalledWith('/new/path/file.md.tmp', expect.any(String));
    });

    it('updates tab state after successful save', async () => {
      mockReadTextFile.mockImplementation(async (path: string) => {
        if (path.endsWith('.tmp')) return 'md:<p>hello</p>';
        return '# hello';
      });

      const { options, tabs } = makeOptions();
      const { saveFile } = useFileOperations(options);

      await saveFile();

      expect(tabs.value[0].hasChanges).toBe(false);
      expect(tabs.value[0].filePath).toBe('/test/file.md');
    });
  });

  // ----------------------------------------------------------
  // openFileFromPath
  // ----------------------------------------------------------

  describe('openFileFromPath', () => {
    it('switches to existing tab if file already open', async () => {
      const existingTab = makeTab({ id: 'existing-tab' });
      const { options, switchToTab } = makeOptions();
      (options.findTabByFilePath as ReturnType<typeof vi.fn>).mockReturnValue(existingTab);

      const { openFileFromPath } = useFileOperations(options);
      await openFileFromPath('/test/file.md');

      expect(switchToTab).toHaveBeenCalledWith('existing-tab');
      expect(mockReadTextFile).not.toHaveBeenCalled();
    });

    it('loads file content and calls onFileOpened callback', async () => {
      mockReadTextFile.mockResolvedValue('# new file content');
      const onFileOpened = vi.fn();

      const { options } = makeOptions({ filePath: null, hasChanges: false, content: '<p></p>' });
      const { openFileFromPath } = useFileOperations({ ...options, onFileOpened });

      await openFileFromPath('/other/file.md');

      expect(mockReadTextFile).toHaveBeenCalledWith('/other/file.md');
      expect(onFileOpened).toHaveBeenCalledWith('/other/file.md', '# new file content');
    });
  });

  // ----------------------------------------------------------
  // Large files — markdown-first open (issue #129)
  // ----------------------------------------------------------

  describe('large file open', () => {
    it('opens a file above the threshold as markdown-first without converting', async () => {
      const bigContent = 'x'.repeat(1_000_001);
      mockReadTextFile.mockResolvedValue(bigContent);
      const onLargeFileOpened = vi.fn();

      const { options, tabs, setEditorContent } = makeOptions(
        { filePath: null, hasChanges: false, content: '<p></p>' },
      );
      const { openFileFromPath } = useFileOperations({ ...options, onLargeFileOpened });

      await openFileFromPath('/big/big.md');

      const tab = tabs.value[0];
      expect(tab.largeFile).toBe(true);
      expect(tab.pendingMarkdown).toBe(bigContent);
      expect(tab.content).toBe('');
      expect(tab.originalMarkdown).toBe(bigContent);
      expect(markdownToHtml).not.toHaveBeenCalled();
      expect(setEditorContent).not.toHaveBeenCalled();
      expect(onLargeFileOpened).toHaveBeenCalledWith('/big/big.md', bigContent);
    });

    it('opens a large file into a new tab as markdown-first when active tab is not empty', async () => {
      const bigContent = 'y'.repeat(1_000_001);
      mockReadTextFile.mockResolvedValue(bigContent);
      const onLargeFileOpened = vi.fn();

      const { options, createNewTab, tabs } = makeOptions();
      tabs.value.push(makeTab({ id: 'new-tab-id', filePath: null, content: '', originalMarkdown: null }));
      const { openFileFromPath } = useFileOperations({ ...options, onLargeFileOpened });

      await openFileFromPath('/big/big.md');

      expect(createNewTab).toHaveBeenCalledWith('/big/big.md', '', 'big.md');
      const newTab = tabs.value.find(t => t.id === 'new-tab-id')!;
      expect(newTab.largeFile).toBe(true);
      expect(newTab.pendingMarkdown).toBe(bigContent);
      expect(markdownToHtml).not.toHaveBeenCalled();
      expect(onLargeFileOpened).toHaveBeenCalledWith('/big/big.md', bigContent);
    });

    it('opens a file below the threshold exactly as before', async () => {
      mockReadTextFile.mockResolvedValue('# small');
      const onLargeFileOpened = vi.fn();

      const { options, tabs } = makeOptions({ filePath: null, hasChanges: false, content: '<p></p>' });
      const { openFileFromPath } = useFileOperations({ ...options, onLargeFileOpened });

      await openFileFromPath('/small/small.md');

      const tab = tabs.value[0];
      expect(tab.largeFile).toBeUndefined();
      expect(tab.pendingMarkdown).toBeUndefined();
      expect(tab.content).toBe('<p># small</p>');
      expect(onLargeFileOpened).not.toHaveBeenCalled();
    });

    it('opens a large file via openFileInNewTab (relative link) as markdown-first', async () => {
      const bigContent = 'z'.repeat(1_000_001);
      mockReadTextFile.mockResolvedValue(bigContent);
      const onLargeFileOpened = vi.fn();

      const { options, createNewTab, tabs } = makeOptions();
      tabs.value.push(makeTab({ id: 'new-tab-id', filePath: null, content: '', originalMarkdown: null }));
      const { openFileInNewTab } = useFileOperations({ ...options, onLargeFileOpened });

      await openFileInNewTab('big.md');

      expect(createNewTab).toHaveBeenCalledWith('test/big.md', '', 'big.md');
      const newTab = tabs.value.find(t => t.id === 'new-tab-id')!;
      expect(newTab.largeFile).toBe(true);
      expect(newTab.pendingMarkdown).toBe(bigContent);
      expect(markdownToHtml).not.toHaveBeenCalled();
      expect(onLargeFileOpened).toHaveBeenCalledWith('test/big.md', bigContent);
    });
  });
});

// ============================================================
// handleLinkClick — in-document anchors
// ============================================================

describe('handleLinkClick — anchors', () => {
  // Returns the scrollTo calls recorded for each container, in DOM order.
  const buildPanes = (panes: Array<{ active?: boolean; html: string }>) => {
    document.body.innerHTML = panes
      .map(
        (p) =>
          `<div class="editor-pane${p.active ? ' active' : ''}">` +
          `<div class="editor-container">${p.html}</div></div>`
      )
      .join('');
    return Array.from(document.querySelectorAll<HTMLElement>('.editor-container')).map((c) => {
      const calls: unknown[] = [];
      c.scrollTo = ((arg: unknown) => calls.push(arg)) as typeof c.scrollTo;
      return calls;
    });
  };

  // Code+preview replaces the whole SplitContainer, so no .editor-pane exists.
  const buildBareContainer = (html: string) => {
    document.body.innerHTML = `<div class="split-editor-preview"><div class="editor-container">${html}</div></div>`;
    const c = document.querySelector<HTMLElement>('.editor-container')!;
    const calls: unknown[] = [];
    c.scrollTo = ((arg: unknown) => calls.push(arg)) as typeof c.scrollTo;
    return calls;
  };

  it('scrolls to an exactly matching heading id', () => {
    const { options } = makeOptions();
    const { handleLinkClick } = useFileOperations(options as never);
    const [calls] = buildPanes([{ active: true, html: '<h2 id="overview">Overview</h2>' }]);

    handleLinkClick('#overview');

    expect(calls).toHaveLength(1);
  });

  it('searches the active pane, not the first one in the DOM', () => {
    const { options } = makeOptions();
    const { handleLinkClick } = useFileOperations(options as never);
    const [inactive, active] = buildPanes([
      { html: '<p>other document</p>' },
      { active: true, html: '<h2 id="overview">Overview</h2>' },
    ]);

    handleLinkClick('#overview');

    expect(inactive).toHaveLength(0);
    expect(active).toHaveLength(1);
  });

  it('falls back to the plain container when no pane is marked active', () => {
    const { options } = makeOptions();
    const { handleLinkClick } = useFileOperations(options as never);
    const calls = buildBareContainer('<h2 id="overview">Overview</h2>');

    handleLinkClick('#overview');

    expect(calls).toHaveLength(1);
  });

  it('resolves an anchor written against the old collapsed-hyphen slug rules', () => {
    const { options } = makeOptions();
    const { handleLinkClick } = useFileOperations(options as never);
    const [calls] = buildPanes([
      { active: true, html: '<h2 id="tier-0--write-path-correctness">Tier 0 — write-path correctness</h2>' },
    ]);

    // What MerMark used to generate, and what users hand-patched their docs to.
    handleLinkClick('#tier-0-write-path-correctness');

    expect(calls).toHaveLength(1);
  });

  it('resolves against heading text when the id is stale after a WYSIWYG edit', () => {
    const { options } = makeOptions();
    const { handleLinkClick } = useFileOperations(options as never);
    const [calls] = buildPanes([
      { active: true, html: '<h2 id="old-title">Renamed Section</h2>' },
    ]);

    handleLinkClick('#renamed-section');

    expect(calls).toHaveLength(1);
  });

  it('decodes percent-encoded anchors', () => {
    const { options } = makeOptions();
    const { handleLinkClick } = useFileOperations(options as never);
    const [calls] = buildPanes([{ active: true, html: '<h2 id="概要">概要</h2>' }]);

    handleLinkClick('#' + encodeURIComponent('概要'));

    expect(calls).toHaveLength(1);
  });

  it('reports a genuinely missing anchor instead of failing silently', () => {
    const onAnchorNotFound = vi.fn();
    const { options } = makeOptions({}, { onAnchorNotFound });
    const { handleLinkClick } = useFileOperations(options as never);
    const [calls] = buildPanes([{ active: true, html: '<h2 id="overview">Overview</h2>' }]);

    handleLinkClick('#nothing-like-this');

    expect(calls).toHaveLength(0);
    expect(onAnchorNotFound).toHaveBeenCalledWith('nothing-like-this');
  });

  it('does not treat an anchor as a file to open', () => {
    const { options, createNewTab } = makeOptions();
    const { handleLinkClick } = useFileOperations(options as never);
    buildPanes([{ active: true, html: '<p>no headings</p>' }]);

    handleLinkClick('#missing');

    expect(createNewTab).not.toHaveBeenCalled();
  });

  it('does not jump to an unrelated heading that carries a stale look-alike id', () => {
    const onAnchorNotFound = vi.fn();
    const { options } = makeOptions({}, { onAnchorNotFound });
    const { handleLinkClick } = useFileOperations(options as never);
    const [calls] = buildPanes([
      {
        active: true,
        html:
          '<h2 id="foo--bar">Deprecated Notice</h2>' +
          '<h2 id="foo-bar-2024">Foo Bar</h2>',
      },
    ]);

    // jsdom gives every element a zero rect, so stub distinct offsets to make
    // WHICH heading was chosen observable in the resulting scroll position.
    const wrong = document.getElementById('foo--bar')!;
    const right = document.getElementById('foo-bar-2024')!;
    const container = document.querySelector('.editor-container')!;
    container.getBoundingClientRect = (() => ({ top: 0 })) as never;
    wrong.getBoundingClientRect = (() => ({ top: 100 })) as never;
    right.getBoundingClientRect = (() => ({ top: 500 })) as never;

    handleLinkClick('#foo-bar');

    // Must land on the heading actually titled "Foo Bar" (500 - 20), never on
    // the one that merely holds a stale double-hyphen id (which would be 80).
    expect(calls).toEqual([{ top: 480, behavior: 'smooth' }]);
    expect(onAnchorNotFound).not.toHaveBeenCalled();
  });

  it('reports ambiguity instead of guessing between two equally good headings', () => {
    const onAnchorNotFound = vi.fn();
    const { options } = makeOptions({}, { onAnchorNotFound });
    const { handleLinkClick } = useFileOperations(options as never);
    const [calls] = buildPanes([
      { active: true, html: '<h2 id="a">Foo Bar</h2><h2 id="b">Foo  Bar</h2>' },
    ]);

    handleLinkClick('#foo-bar');

    expect(calls).toHaveLength(0);
    expect(onAnchorNotFound).toHaveBeenCalledWith('foo-bar');
  });

  it('does not throw on a malformed percent escape, and still reports it', () => {
    const onAnchorNotFound = vi.fn();
    const { options } = makeOptions({}, { onAnchorNotFound });
    const { handleLinkClick } = useFileOperations(options as never);
    buildPanes([{ active: true, html: '<h2 id="coverage">Coverage</h2>' }]);

    expect(() => handleLinkClick('#100%-coverage')).not.toThrow();
    expect(() => handleLinkClick('#a%zz')).not.toThrow();
    expect(onAnchorNotFound).toHaveBeenCalledTimes(2);
  });
});
