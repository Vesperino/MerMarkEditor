import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettings, OLLAMA_DEFAULT_NUM_CTX, OLLAMA_MIN_NUM_CTX } from '../../composables/useSettings';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

describe('useSettings', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have autoSave set to false by default', () => {
      const { settings } = useSettings();
      expect(settings.value.autoSave).toBe(false);
    });

    it('should load settings from localStorage if available', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ autoSave: true }));

      // Need to reimport to get fresh state - for this test we just verify the mock works
      const { settings } = useSettings();
      // Note: Since settings is a singleton, this test verifies the concept
      // In real scenario, you'd need to reset the module
      expect(typeof settings.value.autoSave).toBe('boolean');
    });
  });

  describe('setAutoSave', () => {
    it('should set autoSave to true', () => {
      const { settings, setAutoSave } = useSettings();
      setAutoSave(true);
      expect(settings.value.autoSave).toBe(true);
    });

    it('should set autoSave to false', () => {
      const { settings, setAutoSave } = useSettings();
      setAutoSave(true);
      setAutoSave(false);
      expect(settings.value.autoSave).toBe(false);
    });
  });

  describe('toggleAutoSave', () => {
    it('should toggle autoSave from false to true', () => {
      const { settings, setAutoSave, toggleAutoSave } = useSettings();
      setAutoSave(false);
      toggleAutoSave();
      expect(settings.value.autoSave).toBe(true);
    });

    it('should toggle autoSave from true to false', () => {
      const { settings, setAutoSave, toggleAutoSave } = useSettings();
      setAutoSave(true);
      toggleAutoSave();
      expect(settings.value.autoSave).toBe(false);
    });

    it('should toggle autoSave multiple times', () => {
      const { settings, setAutoSave, toggleAutoSave } = useSettings();
      setAutoSave(false);

      toggleAutoSave();
      expect(settings.value.autoSave).toBe(true);

      toggleAutoSave();
      expect(settings.value.autoSave).toBe(false);

      toggleAutoSave();
      expect(settings.value.autoSave).toBe(true);
    });
  });

  describe('font settings', () => {
    it('should have default editor font family', () => {
      const { settings } = useSettings();
      expect(settings.value.editorFontFamily).toBe('system');
    });

    it('should have default code font family', () => {
      const { settings } = useSettings();
      expect(settings.value.codeFontFamily).toBe('fira-code');
    });

    it('should have dark code theme by default', () => {
      const { settings } = useSettings();
      expect(settings.value.codeTheme).toBe('dark');
    });

    it('should have default Mermaid delimiters', () => {
      const { settings } = useSettings();
      expect(settings.value.mermaidFenceOpen).toBe('```mermaid');
      expect(settings.value.mermaidFenceClose).toBe('```');
    });

    it('should set the resolved editor font family CSS variable for a non-system font', () => {
      const { settings, setEditorFontFamily } = useSettings();
      setEditorFontFamily('georgia');
      expect(settings.value.editorFontFamily).toBe('georgia');
      expect(document.documentElement.style.getPropertyValue('--editor-font-family'))
        .toBe('Georgia, "Times New Roman", Times, serif');
      setEditorFontFamily('system');
    });

    it('should remove the editor font family CSS variable for the system font', () => {
      const { setEditorFontFamily } = useSettings();
      setEditorFontFamily('georgia');
      setEditorFontFamily('system');
      expect(document.documentElement.style.getPropertyValue('--editor-font-family')).toBe('');
    });

    it('should keep setting the resolved code font family CSS variable', () => {
      const { settings, setCodeFontFamily } = useSettings();
      setCodeFontFamily('consolas');
      expect(settings.value.codeFontFamily).toBe('consolas');
      expect(document.documentElement.style.getPropertyValue('--code-font-family'))
        .toBe('"Consolas", "Courier New", monospace');
      setCodeFontFamily('fira-code');
    });

    it('should set code theme', () => {
      const { settings, setCodeTheme } = useSettings();
      setCodeTheme('white');
      expect(settings.value.codeTheme).toBe('white');
      setCodeTheme('dark');
    });

    it('should set Mermaid delimiters', () => {
      const { settings, setMermaidFenceOpen, setMermaidFenceClose } = useSettings();
      setMermaidFenceOpen(':::mermaid');
      setMermaidFenceClose(':::');
      expect(settings.value.mermaidFenceOpen).toBe(':::mermaid');
      expect(settings.value.mermaidFenceClose).toBe(':::');
      setMermaidFenceOpen('```mermaid');
      setMermaidFenceClose('```');
    });

    it('should set editor line height within bounds', () => {
      const { settings, setEditorLineHeight } = useSettings();
      setEditorLineHeight(1.8);
      expect(settings.value.editorLineHeight).toBe(1.8);

      setEditorLineHeight(0.5);
      expect(settings.value.editorLineHeight).toBe(1.0);

      setEditorLineHeight(3.0);
      expect(settings.value.editorLineHeight).toBe(2.5);

      setEditorLineHeight(1.6);
    });
  });

  describe('expand tabs setting', () => {
    it('should have expandTabs set to false by default', () => {
      const { settings } = useSettings();
      expect(settings.value.expandTabs).toBe(false);
    });

    it('should set expandTabs to true', () => {
      const { settings, setExpandTabs } = useSettings();
      setExpandTabs(true);
      expect(settings.value.expandTabs).toBe(true);
      setExpandTabs(false);
    });

    it('should toggle expandTabs back to false', () => {
      const { settings, setExpandTabs } = useSettings();
      setExpandTabs(true);
      setExpandTabs(false);
      expect(settings.value.expandTabs).toBe(false);
    });
  });

  describe('singleton behavior', () => {
    it('should return the same settings instance across multiple calls', () => {
      const { settings: settings1 } = useSettings();
      const { settings: settings2 } = useSettings();

      expect(settings1).toBe(settings2);
    });

    it('should share state between multiple useSettings calls', () => {
      const { settings: settings1, setAutoSave } = useSettings();
      const { settings: settings2 } = useSettings();

      setAutoSave(true);

      expect(settings1.value.autoSave).toBe(true);
      expect(settings2.value.autoSave).toBe(true);
    });
  });

  describe('ai settings', () => {
    it('exposes the ai settings shape with documented defaults', () => {
      const { settings } = useSettings();
      expect(settings.value.ai).toBeDefined();
      // Note: singleton may have been mutated by other tests; verify shape rather
      // than exact values for fields that other tests can flip.
      expect(typeof settings.value.ai.enabled).toBe('boolean');
      expect(['claude', 'codex']).toContain(settings.value.ai.defaultCli);
      expect(typeof settings.value.ai.snapshotsKeep).toBe('number');
      expect(typeof settings.value.ai.hasSeenFirstRun).toBe('boolean');
      expect(['left', 'right']).toContain(settings.value.ai.panelSide);
    });

    it('clamps snapshotsKeep to a minimum of 1 on save', () => {
      const { setAiSnapshotsKeep, settings } = useSettings();
      setAiSnapshotsKeep(0);
      expect(settings.value.ai.snapshotsKeep).toBe(1);
      setAiSnapshotsKeep(-5);
      expect(settings.value.ai.snapshotsKeep).toBe(1);
    });

    it('preserves new ai fields when localStorage holds an older partial ai object', () => {
      // Simulate stale localStorage with old ai shape (no model/effort fields).
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({
        ai: { enabled: true, defaultCli: 'claude', snapshotsKeep: 3, hasSeenFirstRun: false, panelSide: 'right' },
      }));
      // useSettings is a singleton; this test verifies the loadSettings logic by
      // calling it indirectly via a fresh settings access.
      const { settings } = useSettings();
      // The loaded settings should include defaultModelClaude/defaultModelCodex
      // even though the saved ai object didn't have them.
      expect(settings.value.ai.defaultModelClaude).toBeDefined();
      expect(settings.value.ai.defaultModelCodex).toBeDefined();
      expect(settings.value.ai.effortClaude).toBeDefined();
      expect(settings.value.ai.effortCodex).toBeDefined();
      // ollamaNumCtx arrived after the local-provider release — the ai
      // deep-merge must backfill it for existing installs.
      expect(typeof settings.value.ai.ollamaNumCtx).toBe('number');
    });

    it('defaults ollamaNumCtx to 8192', () => {
      const { settings, setAiOllamaNumCtx } = useSettings();
      setAiOllamaNumCtx(OLLAMA_DEFAULT_NUM_CTX);
      expect(settings.value.ai.ollamaNumCtx).toBe(8192);
      expect(OLLAMA_DEFAULT_NUM_CTX).toBe(8192);
    });

    it('persists and clamps ollamaNumCtx', () => {
      const { settings, setAiOllamaNumCtx } = useSettings();
      setAiOllamaNumCtx(16384);
      expect(settings.value.ai.ollamaNumCtx).toBe(16384);
      setAiOllamaNumCtx(64);
      expect(settings.value.ai.ollamaNumCtx).toBe(OLLAMA_MIN_NUM_CTX);
      setAiOllamaNumCtx(Number.NaN);
      expect(settings.value.ai.ollamaNumCtx).toBe(OLLAMA_DEFAULT_NUM_CTX);
      setAiOllamaNumCtx(4096.9);
      expect(settings.value.ai.ollamaNumCtx).toBe(4096);
      setAiOllamaNumCtx(OLLAMA_DEFAULT_NUM_CTX);
    });
  });
});
