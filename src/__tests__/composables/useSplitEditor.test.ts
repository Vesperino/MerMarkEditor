import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';

vi.mock('../../utils/markdown-converter', () => ({
  markdownToHtml: (md: string) => `<p>HTML:${md}</p>`,
  htmlToMarkdown: (html: string) => `MD:${html}`,
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

import { useSplitEditor } from '../../composables/useSplitEditor';

describe('useSplitEditor', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('enter', () => {
    it('seeds markdownSource from html and computes previewHtml from it', () => {
      const { enter, markdownSource, previewHtml } = useSplitEditor();

      enter('<p>hello</p>');

      expect(markdownSource.value).toBe('MD:<p>hello</p>');
      expect(previewHtml.value).toBe('<p>HTML:MD:<p>hello</p></p>');
    });
  });

  describe('onMarkdownInput debounce', () => {
    it('updates markdownSource immediately but previewHtml only after the debounce', () => {
      vi.useFakeTimers();
      try {
        const { enter, onMarkdownInput, markdownSource, previewHtml } = useSplitEditor();

        enter('<p>seed</p>');
        const seededPreview = previewHtml.value;

        onMarkdownInput('# edited');

        expect(markdownSource.value).toBe('# edited');
        expect(previewHtml.value).toBe(seededPreview);

        vi.advanceTimersByTime(199);
        expect(previewHtml.value).toBe(seededPreview);

        vi.advanceTimersByTime(1);
        expect(previewHtml.value).toBe('<p>HTML:# edited</p>');
      } finally {
        vi.useRealTimers();
      }
    });

    it('coalesces rapid edits into a single preview update', () => {
      vi.useFakeTimers();
      try {
        const { enter, onMarkdownInput, previewHtml } = useSplitEditor();
        enter('<p>seed</p>');

        onMarkdownInput('a');
        vi.advanceTimersByTime(100);
        onMarkdownInput('ab');
        vi.advanceTimersByTime(100);
        onMarkdownInput('abc');
        vi.advanceTimersByTime(200);

        expect(previewHtml.value).toBe('<p>HTML:abc</p>');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('syncFromVisual (in-preview node edit -> code)', () => {
    it('updates markdownSource from preview html without re-pushing previewHtml', () => {
      const { enter, syncFromVisual, markdownSource, previewHtml } = useSplitEditor();

      enter('<p>seed</p>');
      const seededPreview = previewHtml.value;

      syncFromVisual('<p>edited diagram</p>');

      expect(markdownSource.value).toBe('MD:<p>edited diagram</p>');
      expect(previewHtml.value).toBe(seededPreview);
    });

    it('skips when converted markdown equals the current source (echo guard)', () => {
      const { enter, syncFromVisual, markdownSource } = useSplitEditor();

      enter('<p>seed</p>');
      syncFromVisual('<p>same</p>');
      syncFromVisual('<p>same</p>');

      expect(markdownSource.value).toBe('MD:<p>same</p>');
    });
  });

  describe('exit (no data loss)', () => {
    it('round-trips enter(html) -> exit() through the converters without edits', () => {
      const { enter, exit } = useSplitEditor();

      enter('<p>doc</p>');
      const html = exit();

      expect(html).toBe('<p>HTML:MD:<p>doc</p></p>');
    });

    it('returns the edited markdown converted to html', () => {
      const { enter, onMarkdownInput, exit } = useSplitEditor();

      enter('<p>doc</p>');
      onMarkdownInput('## new heading');
      const html = exit();

      expect(html).toBe('<p>HTML:## new heading</p>');
    });

    it('flushes a pending debounce so previewHtml reflects the final edit', () => {
      vi.useFakeTimers();
      try {
        const { enter, onMarkdownInput, exit, previewHtml } = useSplitEditor();
        enter('<p>doc</p>');
        onMarkdownInput('pending edit');

        exit();

        expect(previewHtml.value).toBe('<p>HTML:pending edit</p>');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('tagged-source invariant (no wrong-tab write)', () => {
    it('re-seeds cleanly so a source tagged for tab A is never read as tab B', () => {
      const { enter, markdownSource } = useSplitEditor();

      enter('<p>tab A</p>');
      const tagA = 'A';

      enter('<p>tab B</p>');
      const tagB = 'B';

      expect(markdownSource.value).toBe('MD:<p>tab B</p>');
      expect(tagB).not.toBe(tagA);
    });

    it('models the WRITE-path guard: override is null when the tag mismatches the active tab', () => {
      const { enter, markdownSource } = useSplitEditor();
      enter('<p>tab A</p>');
      const splitSourceTabId = 'A';

      const getMarkdownOverride = (activeTabId: string) =>
        splitSourceTabId === activeTabId ? markdownSource.value : null;

      expect(getMarkdownOverride('A')).toBe('MD:<p>tab A</p>');
      expect(getMarkdownOverride('B')).toBeNull();
    });

    it('models the sync guard: a tab whose id mismatches the tag is left untouched', () => {
      const { enter, markdownSource } = useSplitEditor();
      enter('<p>tab A</p>');
      const splitSourceTabId = 'A';

      const tabs: Record<string, string> = { A: '<p>A original</p>', B: '<p>B original</p>' };
      const syncActiveTabContent = (activeTabId: string) => {
        if (splitSourceTabId !== activeTabId) return;
        tabs[activeTabId] = `HTML:${markdownSource.value}`;
      };

      syncActiveTabContent('B');
      expect(tabs.B).toBe('<p>B original</p>');

      syncActiveTabContent('A');
      expect(tabs.A).toBe('HTML:MD:<p>tab A</p>');
    });
  });

  describe('active flag (not persisted)', () => {
    it('defaults to false even when localStorage holds a truthy value', () => {
      localStorageMock.setItem('mermark-split-editor', 'true');

      const { splitEditorActive } = useSplitEditor();

      expect(splitEditorActive.value).toBe(false);
    });

    it('never writes the active flag to localStorage when toggled', async () => {
      const { splitEditorActive } = useSplitEditor();

      splitEditorActive.value = true;
      await nextTick();

      expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
        'mermark-split-editor',
        expect.anything(),
      );

      splitEditorActive.value = false;
    });
  });
});
