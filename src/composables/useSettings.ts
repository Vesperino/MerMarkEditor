import { ref, watch } from 'vue';
import type { TokenModelId } from '../services/tokenCounter';
import { TOKEN_MODELS } from '../services/tokenCounter';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DEFAULT_SORT_MODE, migrateSortMode, type WorkspaceSortMode } from '../utils/workspace-sort';
import { DEFAULT_MERMAID_DELIMITERS, setCurrentMermaidDelimiters } from '../utils/mermaid-delimiters';
import {
  BUILTIN_MERMAID_FORMATS,
  CUSTOM_FORMAT_ID,
  STANDARD_FORMAT_ID,
  findFormatById,
  isValidFormat,
  setCurrentMermaidReadFormats,
  setCurrentMermaidWriteFormat,
  type MermaidFormat,
} from '../utils/mermaid-formats';

export type ThemeMode = 'light' | 'dark';
export type ThemeVariant = 'default' | 'minimal';
export type CodeThemeMode = 'dark' | 'white';
export type CliKind = 'claude' | 'codex' | 'ollama' | 'openai';
export type PanelSide = 'left' | 'right';

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';
export const OPENAI_DEFAULT_BASE_URL = 'http://localhost:8080';
export const OLLAMA_DEFAULT_NUM_CTX = 8192;
export const OLLAMA_MIN_NUM_CTX = 512;

/** A workspace currently pinned in the sidebar (one of N concurrent roots). */
export interface OpenWorkspaceEntry {
  /** Stable id (uuid) — used to identify the active tab independent of path. */
  id: string;
  /** Absolute path to the folder root. */
  rootPath: string;
  /** Display name (defaults to basename of rootPath). */
  name: string;
}

export interface WorkspaceSettings {
  /** Currently open workspaces (sidebar tabs). Empty when no workspace is open. */
  openWorkspaces: OpenWorkspaceEntry[];
  /** Id of the currently active workspace, or null when none. */
  activeWorkspaceId: string | null;
  /** Recently closed workspace roots (LRU, most recent first). Excludes currently open. */
  recentRoots: string[];
  /** Whether the workspace sidebar is currently visible. */
  sidebarVisible: boolean;
  /** Pixel width of the workspace sidebar. */
  sidebarWidth: number;
  /** Global default tree sort order. */
  sortMode: WorkspaceSortMode;
  /** Per-workspace sort overrides, keyed by workspace id. */
  sortByWorkspace: Record<string, WorkspaceSortMode>;
  /** Per-folder sort overrides, keyed by absolute folder path. */
  sortByFolder: Record<string, WorkspaceSortMode>;
}

export type { WorkspaceSortMode } from '../utils/workspace-sort';

export const RECENT_WORKSPACES_LIMIT = 10;
export const OPEN_WORKSPACES_LIMIT = 8;
export const SIDEBAR_WIDTH_MIN = 160;
export const SIDEBAR_WIDTH_MAX = 480;
export const SIDEBAR_WIDTH_DEFAULT = 240;

export interface AiSettings {
  enabled: boolean;
  defaultCli: CliKind;
  defaultModelClaude: string;
  defaultModelCodex: string;
  defaultModelOllama: string;
  defaultModelOpenai: string;
  effortClaude: string;
  effortCodex: string;
  /** Base URL of the local Ollama HTTP API. Empty = default localhost:11434. */
  ollamaBaseUrl: string;
  /** Ollama runtime context window (options.num_ctx). Bigger = more RAM/VRAM. */
  ollamaNumCtx: number;
  /** Base URL of the local OpenAI-compatible server. Empty = default localhost:8080. */
  openaiBaseUrl: string;
  snapshotsKeep: number;
  hasSeenFirstRun: boolean;
  panelSide: PanelSide;
  /** Optional manual override for the `claude` binary path. Empty = autodetect via PATH. */
  cliPathClaude: string;
  /** Optional manual override for the `codex` binary path. Empty = autodetect via PATH. */
  cliPathCodex: string;
  /**
   * Last-known-good absolute path for the `claude` binary. Populated automatically
   * after a successful health check; passed back to subsequent probes as the
   * `override_path` so the backend skips its curated-dir scan + login-shell
   * fallback (which costs ~50–150 ms on macOS, longer on slow shells).
   * Distinct from `cliPathClaude` — that field is the user's manual override.
   */
  cliResolvedPathClaude: string;
  /** Last-known-good resolved path for `codex`; same semantics as above. */
  cliResolvedPathCodex: string;
}

export interface FontPreset {
  id: string;
  label: string;
  fontFamily: string;
}

export const EDITOR_FONTS: FontPreset[] = [
  { id: 'system', label: 'System Default', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif' },
  { id: 'georgia', label: 'Georgia (Serif)', fontFamily: 'Georgia, "Times New Roman", Times, serif' },
  { id: 'times', label: 'Times New Roman', fontFamily: '"Times New Roman", Times, serif' },
  { id: 'palatino', label: 'Palatino', fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { id: 'garamond', label: 'Garamond', fontFamily: 'Garamond, "EB Garamond", serif' },
  { id: 'verdana', label: 'Verdana', fontFamily: 'Verdana, Geneva, sans-serif' },
  { id: 'arial', label: 'Arial', fontFamily: 'Arial, Helvetica, sans-serif' },
  { id: 'segoe-ui', label: 'Segoe UI', fontFamily: '"Segoe UI", Tahoma, Geneva, sans-serif' },
  { id: 'helvetica', label: 'Helvetica', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', fontFamily: '"Trebuchet MS", "Lucida Grande", sans-serif' },
  { id: 'calibri', label: 'Calibri', fontFamily: 'Calibri, "Gill Sans", sans-serif' },
  { id: 'open-sans', label: 'Open Sans', fontFamily: '"Open Sans", sans-serif' },
  { id: 'consolas', label: 'Consolas (Mono)', fontFamily: '"Consolas", "Lucida Console", monospace' },
];

export const CODE_FONTS: FontPreset[] = [
  { id: 'fira-code', label: 'Fira Code', fontFamily: '"Fira Code", "Consolas", monospace' },
  { id: 'consolas', label: 'Consolas', fontFamily: '"Consolas", "Courier New", monospace' },
  { id: 'cascadia-code', label: 'Cascadia Code', fontFamily: '"Cascadia Code", "Cascadia Mono", "Consolas", monospace' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', fontFamily: '"JetBrains Mono", "Fira Code", monospace' },
  { id: 'source-code-pro', label: 'Source Code Pro', fontFamily: '"Source Code Pro", "Consolas", monospace' },
  { id: 'lucida-console', label: 'Lucida Console', fontFamily: '"Lucida Console", "Lucida Sans Typewriter", monospace' },
  { id: 'courier-new', label: 'Courier New', fontFamily: '"Courier New", Courier, monospace' },
  { id: 'monaco', label: 'Monaco', fontFamily: '"Monaco", "Menlo", "Consolas", monospace' },
  { id: 'menlo', label: 'Menlo', fontFamily: '"Menlo", "Monaco", "Consolas", monospace' },
  { id: 'pt-mono', label: 'PT Mono', fontFamily: '"PT Mono", "Consolas", monospace' },
];

export interface AppSettings {
  autoSave: boolean;
  showTokenCount: boolean;
  tokenModel: TokenModelId;
  theme: ThemeMode;
  themeVariant: ThemeVariant;
  codeTheme: CodeThemeMode;
  codeWordWrap: boolean;
  editorFontFamily: string;
  codeFontFamily: string;
  editorLineHeight: number;
  spellcheck: boolean;
  expandTabs: boolean;
  showLineNumbers: boolean;
  /** When true, the vertical left toolbar widens to show text labels next to icons. */
  leftBarExpanded: boolean;
  /** Top padding of the editor surface, in pixels (clamped 0–80). */
  editorPaddingTop: number;
  /** Bottom padding of the editor surface, in pixels (clamped 0–160). */
  editorPaddingBottom: number;
  /** Horizontal margins of the editor surface, in pixels per side (clamped 0–160).
   *  Functions as a soft outer gutter — content max-width is enforced by the
   *  Minimal theme's reading measure independently. */
  editorPaddingX: number;
  /** @deprecated kept for migration from older builds — use mermaidWriteFormatId. */
  mermaidFenceOpen?: string;
  /** @deprecated kept for migration from older builds — use mermaidWriteFormatId. */
  mermaidFenceClose?: string;
  /** Id of the format used when serialising mermaid blocks back to markdown. */
  mermaidWriteFormatId: string;
  /** Builtins/custom that the parser will recognise on read. The standard
   *  format is always parsed even if absent from this list, so dropping it
   *  from the UI does not break files shared from GitHub etc. */
  enabledReadFormatIds: string[];
  /** User-defined mermaid delimiter pair. Active only when its id is selected
   *  in `mermaidWriteFormatId` or appears in `enabledReadFormatIds`. */
  customMermaidFormat: { open: string; close: string } | null;
  workspace: WorkspaceSettings;
  ai: AiSettings;
}

export const EDITOR_PAD_TOP_MIN = 0;
export const EDITOR_PAD_TOP_MAX = 80;
export const EDITOR_PAD_BOTTOM_MIN = 0;
export const EDITOR_PAD_BOTTOM_MAX = 160;
export const EDITOR_PAD_X_MIN = 0;
export const EDITOR_PAD_X_MAX = 160;

const STORAGE_KEY = 'mermark-settings';

/** crypto.randomUUID is available in modern browsers; fall back to Math.random for very old engines (test envs). */
function makeWorkspaceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function basenameOfPath(p: string): string {
  if (!p) return '';
  const trimmed = p.replace(/[/\\]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

// Valid model IDs for migration
const VALID_MODEL_IDS = Object.keys(TOKEN_MODELS) as TokenModelId[];

function migrateTokenModel(modelId: string): TokenModelId {
  // If already valid, return as-is
  if (VALID_MODEL_IDS.includes(modelId as TokenModelId)) {
    return modelId as TokenModelId;
  }

  // Migration map for old model IDs to new simplified IDs
  const migrationMap: Record<string, TokenModelId> = {
    // Old GPT models -> gpt
    'gpt3': 'gpt',
    'gpt4': 'gpt',
    'gpt4o': 'gpt',
    'gpt5': 'gpt',
    'gpt52': 'gpt',
    'o1': 'gpt',
    // Old Claude models -> claude
    'claude-opus': 'claude',
    'claude-sonnet': 'claude',
    'claude-haiku': 'claude',
    // Old Gemini models -> gemini
    'gemini-pro': 'gemini',
    'gemini-flash': 'gemini',
    // Other
    'llama3': 'gpt', // Fallback to GPT
  };

  return migrationMap[modelId] || 'gpt';
}

function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old token model IDs
      if (parsed.tokenModel) {
        parsed.tokenModel = migrateTokenModel(parsed.tokenModel);
      }
      if (parsed.codeTheme && !['dark', 'white'].includes(parsed.codeTheme)) {
        parsed.codeTheme = getDefaultSettings().codeTheme;
      }
      if (parsed.ai && typeof parsed.ai.snapshotsKeep === 'number') {
        parsed.ai.snapshotsKeep = Math.max(1, Math.floor(parsed.ai.snapshotsKeep));
      }
      const defaults = getDefaultSettings();
      // Deep-merge the ai field so new fields added in updates get their defaults
      // even when localStorage holds an older partial ai object.
      const mergedAi = { ...defaults.ai, ...(parsed.ai ?? {}) };
      const mergedWorkspace = { ...defaults.workspace, ...(parsed.workspace ?? {}) };
      // Normalize sort settings — legacy builds stored 'name' | 'modified'.
      mergedWorkspace.sortMode = migrateSortMode(mergedWorkspace.sortMode as unknown as string);
      mergedWorkspace.sortByWorkspace = mergedWorkspace.sortByWorkspace ?? {};
      mergedWorkspace.sortByFolder = mergedWorkspace.sortByFolder ?? {};

      // Clamp sidebar width to valid range in case storage holds out-of-range value
      mergedWorkspace.sidebarWidth = Math.max(
        SIDEBAR_WIDTH_MIN,
        Math.min(SIDEBAR_WIDTH_MAX, mergedWorkspace.sidebarWidth || SIDEBAR_WIDTH_DEFAULT),
      );

      // Migrate v1 single-workspace shape (lastRoot: string | null) to v2 multi-workspace
      // (openWorkspaces[] + activeWorkspaceId). Detect v1 by presence of lastRoot field.
      if ('lastRoot' in mergedWorkspace || !Array.isArray(mergedWorkspace.openWorkspaces)) {
        const legacyLastRoot = (mergedWorkspace as { lastRoot?: string | null }).lastRoot ?? null;
        if (legacyLastRoot) {
          const migratedId = makeWorkspaceId();
          mergedWorkspace.openWorkspaces = [
            { id: migratedId, rootPath: legacyLastRoot, name: basenameOfPath(legacyLastRoot) || legacyLastRoot },
          ];
          mergedWorkspace.activeWorkspaceId = migratedId;
        } else {
          mergedWorkspace.openWorkspaces = [];
          mergedWorkspace.activeWorkspaceId = null;
        }
        delete (mergedWorkspace as { lastRoot?: unknown }).lastRoot;
      }

      // Defensively normalize: cap to limit, drop dupes by rootPath, ensure id present
      const seenPaths = new Set<string>();
      mergedWorkspace.openWorkspaces = (mergedWorkspace.openWorkspaces as OpenWorkspaceEntry[])
        .filter((w) => w && typeof w.rootPath === 'string' && w.rootPath)
        .filter((w) => {
          if (seenPaths.has(w.rootPath)) return false;
          seenPaths.add(w.rootPath);
          return true;
        })
        .slice(0, OPEN_WORKSPACES_LIMIT)
        .map((w) => ({
          id: w.id || makeWorkspaceId(),
          rootPath: w.rootPath,
          name: w.name || basenameOfPath(w.rootPath) || w.rootPath,
        }));

      // Active id must point to one of the open workspaces; otherwise pick first or null.
      const activeStillOpen = mergedWorkspace.openWorkspaces.some(
        (w: OpenWorkspaceEntry) => w.id === mergedWorkspace.activeWorkspaceId,
      );
      if (!activeStillOpen) {
        mergedWorkspace.activeWorkspaceId = mergedWorkspace.openWorkspaces[0]?.id ?? null;
      }

      // Trim recents that exceed the limit (e.g. limit lowered between versions)
      if (Array.isArray(mergedWorkspace.recentRoots)) {
        mergedWorkspace.recentRoots = mergedWorkspace.recentRoots.slice(0, RECENT_WORKSPACES_LIMIT);
      } else {
        mergedWorkspace.recentRoots = [];
      }

      const themeVariant: ThemeVariant = parsed.themeVariant === 'minimal' ? 'minimal' : 'default';
      const merged: AppSettings = {
        ...defaults,
        ...parsed,
        themeVariant,
        workspace: mergedWorkspace,
        ai: mergedAi,
      };

      // Migrate v1 single-pair mermaid delimiters to the new format registry.
      // Older builds stored `mermaidFenceOpen` / `mermaidFenceClose` directly;
      // map that pair to a builtin format id if possible, otherwise install it
      // as the user's custom format and switch the write id to "custom".
      if (typeof parsed.mermaidWriteFormatId !== 'string') {
        const open = (parsed.mermaidFenceOpen ?? '').trim();
        const close = (parsed.mermaidFenceClose ?? '').trim();
        if (open && close) {
          const builtin = BUILTIN_MERMAID_FORMATS.find((f) => f.open === open && f.close === close);
          if (builtin) {
            merged.mermaidWriteFormatId = builtin.id;
          } else {
            merged.customMermaidFormat = { open, close };
            merged.mermaidWriteFormatId = CUSTOM_FORMAT_ID;
            if (!merged.enabledReadFormatIds.includes(CUSTOM_FORMAT_ID)) {
              merged.enabledReadFormatIds = [...merged.enabledReadFormatIds, CUSTOM_FORMAT_ID];
            }
          }
        } else {
          merged.mermaidWriteFormatId = STANDARD_FORMAT_ID;
        }
      }
      if (!Array.isArray(merged.enabledReadFormatIds) || merged.enabledReadFormatIds.length === 0) {
        merged.enabledReadFormatIds = BUILTIN_MERMAID_FORMATS.map((f) => f.id);
      }
      return merged;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return getDefaultSettings();
}

function getDefaultSettings(): AppSettings {
  return {
    autoSave: false,
    showTokenCount: true,
    tokenModel: 'gpt',
    theme: 'light',
    themeVariant: 'default',
    codeTheme: 'dark',
    codeWordWrap: true,
    editorFontFamily: 'system',
    codeFontFamily: 'fira-code',
    editorLineHeight: 1.6,
    spellcheck: false,
    expandTabs: false,
    showLineNumbers: false,
    leftBarExpanded: false,
    editorPaddingTop: 16,
    editorPaddingBottom: 32,
    editorPaddingX: 24,
    mermaidFenceOpen: DEFAULT_MERMAID_DELIMITERS.open,
    mermaidFenceClose: DEFAULT_MERMAID_DELIMITERS.close,
    mermaidWriteFormatId: STANDARD_FORMAT_ID,
    enabledReadFormatIds: BUILTIN_MERMAID_FORMATS.map((f) => f.id),
    customMermaidFormat: null,
    workspace: {
      openWorkspaces: [],
      activeWorkspaceId: null,
      recentRoots: [],
      sidebarVisible: true,
      sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
      sortMode: DEFAULT_SORT_MODE,
      sortByWorkspace: {},
      sortByFolder: {},
    },
    ai: {
      enabled: true,
      defaultCli: 'claude',
      defaultModelClaude: 'claude-opus-4-7',
      defaultModelCodex: 'gpt-5.5',
      defaultModelOllama: '',
      defaultModelOpenai: '',
      effortClaude: 'high',
      effortCodex: 'high',
      ollamaBaseUrl: OLLAMA_DEFAULT_BASE_URL,
      ollamaNumCtx: OLLAMA_DEFAULT_NUM_CTX,
      openaiBaseUrl: OPENAI_DEFAULT_BASE_URL,
      snapshotsKeep: 3,
      hasSeenFirstRun: false,
      panelSide: 'right',
      cliPathClaude: '',
      cliPathCodex: '',
      cliResolvedPathClaude: '',
      cliResolvedPathCodex: '',
    },
  };
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Singleton state
const settings = ref<AppSettings>(loadSettings());

// Auto-save settings when they change
watch(settings, (newSettings) => {
  saveSettings(newSettings);
}, { deep: true });

export function useSettings() {
  const setAutoSave = (value: boolean) => {
    settings.value.autoSave = value;
  };

  const toggleAutoSave = () => {
    settings.value.autoSave = !settings.value.autoSave;
  };

  const setShowTokenCount = (value: boolean) => {
    settings.value.showTokenCount = value;
  };

  const toggleShowTokenCount = () => {
    settings.value.showTokenCount = !settings.value.showTokenCount;
  };

  const setTokenModel = (model: TokenModelId) => {
    settings.value.tokenModel = model;
  };

  const setTheme = (theme: ThemeMode) => {
    settings.value.theme = theme;
    applyTheme(theme);
  };

  const toggleTheme = () => {
    const newTheme = settings.value.theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  const setThemeVariant = (variant: ThemeVariant) => {
    settings.value.themeVariant = variant;
    applyThemeVariant(variant);
  };

  const setOpenWorkspaces = (list: OpenWorkspaceEntry[]) => {
    // Cap, drop dupes by rootPath
    const seen = new Set<string>();
    const next: OpenWorkspaceEntry[] = [];
    for (const w of list) {
      if (!w?.rootPath || seen.has(w.rootPath)) continue;
      seen.add(w.rootPath);
      next.push({
        id: w.id || makeWorkspaceId(),
        rootPath: w.rootPath,
        name: w.name || basenameOfPath(w.rootPath) || w.rootPath,
      });
      if (next.length >= OPEN_WORKSPACES_LIMIT) break;
    }
    settings.value.workspace.openWorkspaces = next;
    // Keep activeWorkspaceId valid
    if (!next.some((w) => w.id === settings.value.workspace.activeWorkspaceId)) {
      settings.value.workspace.activeWorkspaceId = next[0]?.id ?? null;
    }
  };

  const setActiveWorkspaceId = (id: string | null) => {
    if (id === null) {
      settings.value.workspace.activeWorkspaceId = null;
      return;
    }
    if (settings.value.workspace.openWorkspaces.some((w) => w.id === id)) {
      settings.value.workspace.activeWorkspaceId = id;
    }
  };

  const setWorkspaceRecents = (recents: string[]) => {
    settings.value.workspace.recentRoots = recents.slice(0, RECENT_WORKSPACES_LIMIT);
  };

  const setSidebarVisible = (visible: boolean) => {
    settings.value.workspace.sidebarVisible = visible;
  };

  const toggleSidebarVisible = () => {
    settings.value.workspace.sidebarVisible = !settings.value.workspace.sidebarVisible;
  };

  const setSidebarWidth = (width: number) => {
    settings.value.workspace.sidebarWidth = Math.max(
      SIDEBAR_WIDTH_MIN,
      Math.min(SIDEBAR_WIDTH_MAX, Math.round(width)),
    );
  };

  const setWorkspaceSortMode = (mode: WorkspaceSortMode) => {
    settings.value.workspace.sortMode = mode;
  };

  const setWorkspaceSortOverride = (workspaceId: string, mode: WorkspaceSortMode | null) => {
    const map = { ...settings.value.workspace.sortByWorkspace };
    if (mode === null) delete map[workspaceId];
    else map[workspaceId] = mode;
    settings.value.workspace.sortByWorkspace = map;
  };

  const setFolderSortOverride = (folderPath: string, mode: WorkspaceSortMode | null) => {
    const map = { ...settings.value.workspace.sortByFolder };
    if (mode === null) delete map[folderPath];
    else map[folderPath] = mode;
    settings.value.workspace.sortByFolder = map;
  };

  const toggleCodeWordWrap = () => {
    settings.value.codeWordWrap = !settings.value.codeWordWrap;
  };

  const setCodeTheme = (theme: CodeThemeMode) => {
    settings.value.codeTheme = theme;
    applyCssVars(settings.value);
  };

  const setEditorFontFamily = (fontId: string) => {
    settings.value.editorFontFamily = fontId;
    applyCssVars(settings.value);
  };

  const setCodeFontFamily = (fontId: string) => {
    settings.value.codeFontFamily = fontId;
    applyCssVars(settings.value);
  };

  const setEditorLineHeight = (lh: number) => {
    settings.value.editorLineHeight = Math.max(1.0, Math.min(2.5, lh));
    applyCssVars(settings.value);
  };

  const setSpellcheck = (value: boolean) => {
    settings.value.spellcheck = value;
  };

  const setExpandTabs = (value: boolean) => {
    settings.value.expandTabs = value;
  };

  const setShowLineNumbers = (value: boolean) => {
    settings.value.showLineNumbers = value;
  };

  const toggleShowLineNumbers = () => {
    settings.value.showLineNumbers = !settings.value.showLineNumbers;
  };

  const setLeftBarExpanded = (v: boolean) => { settings.value.leftBarExpanded = v; };
  const toggleLeftBarExpanded = () => { settings.value.leftBarExpanded = !settings.value.leftBarExpanded; };

  const setEditorPaddingTop = (v: number) => {
    settings.value.editorPaddingTop = Math.max(EDITOR_PAD_TOP_MIN, Math.min(EDITOR_PAD_TOP_MAX, Math.round(v)));
    applyCssVars(settings.value);
  };
  const setEditorPaddingBottom = (v: number) => {
    settings.value.editorPaddingBottom = Math.max(EDITOR_PAD_BOTTOM_MIN, Math.min(EDITOR_PAD_BOTTOM_MAX, Math.round(v)));
    applyCssVars(settings.value);
  };
  const setEditorPaddingX = (v: number) => {
    settings.value.editorPaddingX = Math.max(EDITOR_PAD_X_MIN, Math.min(EDITOR_PAD_X_MAX, Math.round(v)));
    applyCssVars(settings.value);
  };
  const setMermaidWriteFormatId = (id: string) => {
    const all = listAllMermaidFormats(settings.value);
    if (all.some((f) => f.id === id)) {
      settings.value.mermaidWriteFormatId = id;
      if (!settings.value.enabledReadFormatIds.includes(id)) {
        settings.value.enabledReadFormatIds = [...settings.value.enabledReadFormatIds, id];
      }
    }
  };

  const setEnabledReadFormatIds = (ids: string[]) => {
    const all = listAllMermaidFormats(settings.value);
    const filtered = ids.filter((id) => all.some((f) => f.id === id));
    const next = filtered.length > 0 ? filtered : [STANDARD_FORMAT_ID];
    if (!next.includes(settings.value.mermaidWriteFormatId)) {
      // Keep the write format readable so save→reload stays a no-op.
      next.push(settings.value.mermaidWriteFormatId);
    }
    settings.value.enabledReadFormatIds = next;
  };

  const setCustomMermaidFormat = (pair: { open: string; close: string } | null) => {
    if (!pair || !pair.open?.trim() || !pair.close?.trim()) {
      // Removing the custom format: also drop it from enabled reads and reset
      // the write format if it was pointing at custom.
      settings.value.customMermaidFormat = null;
      settings.value.enabledReadFormatIds = settings.value.enabledReadFormatIds.filter(
        (id) => id !== CUSTOM_FORMAT_ID,
      );
      if (settings.value.mermaidWriteFormatId === CUSTOM_FORMAT_ID) {
        settings.value.mermaidWriteFormatId = STANDARD_FORMAT_ID;
      }
      return;
    }
    settings.value.customMermaidFormat = {
      open: pair.open.trim(),
      close: pair.close.trim(),
    };
    if (!settings.value.enabledReadFormatIds.includes(CUSTOM_FORMAT_ID)) {
      settings.value.enabledReadFormatIds = [
        ...settings.value.enabledReadFormatIds,
        CUSTOM_FORMAT_ID,
      ];
    }
  };

  /** @deprecated kept for tests / older callers. Routes through the custom-format slot. */
  const setMermaidFenceOpen = (v: string) => {
    const open = v.trim() || DEFAULT_MERMAID_DELIMITERS.open;
    const close = settings.value.customMermaidFormat?.close
      ?? settings.value.mermaidFenceClose
      ?? DEFAULT_MERMAID_DELIMITERS.close;
    setCustomMermaidFormat({ open, close });
    settings.value.mermaidWriteFormatId = CUSTOM_FORMAT_ID;
    settings.value.mermaidFenceOpen = open;
  };
  /** @deprecated kept for tests / older callers. Routes through the custom-format slot. */
  const setMermaidFenceClose = (v: string) => {
    const close = v.trim() || DEFAULT_MERMAID_DELIMITERS.close;
    const open = settings.value.customMermaidFormat?.open
      ?? settings.value.mermaidFenceOpen
      ?? DEFAULT_MERMAID_DELIMITERS.open;
    setCustomMermaidFormat({ open, close });
    settings.value.mermaidWriteFormatId = CUSTOM_FORMAT_ID;
    settings.value.mermaidFenceClose = close;
  };

  const setAiEnabled = (v: boolean) => { settings.value.ai.enabled = v; };
  const setAiDefaultCli = (v: CliKind) => { settings.value.ai.defaultCli = v; };
  const setAiDefaultModelClaude = (v: string) => { settings.value.ai.defaultModelClaude = v; };
  const setAiDefaultModelCodex = (v: string) => { settings.value.ai.defaultModelCodex = v; };
  const setAiDefaultModelOllama = (v: string) => { settings.value.ai.defaultModelOllama = v; };
  const setAiDefaultModelOpenai = (v: string) => { settings.value.ai.defaultModelOpenai = v; };
  const setAiOllamaBaseUrl = (v: string) => { settings.value.ai.ollamaBaseUrl = (v ?? '').trim(); };
  const setAiOllamaNumCtx = (v: number) => {
    const n = Math.floor(v);
    settings.value.ai.ollamaNumCtx = Number.isFinite(n)
      ? Math.max(OLLAMA_MIN_NUM_CTX, n)
      : OLLAMA_DEFAULT_NUM_CTX;
  };
  const setAiOpenaiBaseUrl = (v: string) => { settings.value.ai.openaiBaseUrl = (v ?? '').trim(); };
  const setAiEffortClaude = (v: string) => { settings.value.ai.effortClaude = v; };
  const setAiEffortCodex = (v: string) => { settings.value.ai.effortCodex = v; };
  const setAiSnapshotsKeep = (v: number) => {
    settings.value.ai.snapshotsKeep = Math.max(1, Math.floor(v));
  };
  const setAiHasSeenFirstRun = (v: boolean) => { settings.value.ai.hasSeenFirstRun = v; };
  const setAiPanelSide = (v: PanelSide) => { settings.value.ai.panelSide = v; };
  const setAiCliPathClaude = (v: string) => { settings.value.ai.cliPathClaude = v.trim(); };
  const setAiCliPathCodex = (v: string) => { settings.value.ai.cliPathCodex = v.trim(); };
  const setAiCliResolvedPathClaude = (v: string) => { settings.value.ai.cliResolvedPathClaude = (v ?? '').trim(); };
  const setAiCliResolvedPathCodex = (v: string) => { settings.value.ai.cliResolvedPathCodex = (v ?? '').trim(); };

  return {
    settings,
    setAutoSave,
    toggleAutoSave,
    setShowTokenCount,
    toggleShowTokenCount,
    setTokenModel,
    setTheme,
    toggleTheme,
    setThemeVariant,
    toggleCodeWordWrap,
    setCodeTheme,
    setEditorFontFamily,
    setCodeFontFamily,
    setEditorLineHeight,
    setSpellcheck,
    setExpandTabs,
    setShowLineNumbers,
    toggleShowLineNumbers,
    setLeftBarExpanded,
    toggleLeftBarExpanded,
    setEditorPaddingTop,
    setEditorPaddingBottom,
    setEditorPaddingX,
    setMermaidFenceOpen,
    setMermaidFenceClose,
    setMermaidWriteFormatId,
    setEnabledReadFormatIds,
    setCustomMermaidFormat,
    setOpenWorkspaces,
    setActiveWorkspaceId,
    setWorkspaceRecents,
    setSidebarVisible,
    toggleSidebarVisible,
    setSidebarWidth,
    setWorkspaceSortMode,
    setWorkspaceSortOverride,
    setFolderSortOverride,
    setAiEnabled,
    setAiDefaultCli,
    setAiDefaultModelClaude,
    setAiDefaultModelCodex,
    setAiDefaultModelOllama,
    setAiDefaultModelOpenai,
    setAiOllamaBaseUrl,
    setAiOllamaNumCtx,
    setAiOpenaiBaseUrl,
    setAiEffortClaude,
    setAiEffortCodex,
    setAiSnapshotsKeep,
    setAiHasSeenFirstRun,
    setAiPanelSide,
    setAiCliPathClaude,
    setAiCliPathCodex,
    setAiCliResolvedPathClaude,
    setAiCliResolvedPathCodex,
  };
}

// Apply theme variant attribute to HTML element so CSS can target
// `html[data-variant="minimal"]`. Orthogonal to the light/dark mode class.
function applyThemeVariant(variant: ThemeVariant) {
  document.documentElement.setAttribute('data-variant', variant);
}

// Apply theme class to HTML element
function applyTheme(theme: ThemeMode) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  try {
    getCurrentWindow().setTheme(theme);
  } catch {
    // ignore outside Tauri context
  }
}

// Resolve a font setting to a CSS font-family value.
// If it matches a preset id, use the preset's fontFamily stack;
// otherwise treat the value as a direct system font family name.
function resolveEditorFont(id: string): string {
  const preset = EDITOR_FONTS.find(f => f.id === id);
  if (preset) return preset.fontFamily;
  // Direct system font name — wrap in quotes + sans-serif fallback
  return `"${id}", sans-serif`;
}

function resolveCodeFont(id: string): string {
  const preset = CODE_FONTS.find(f => f.id === id);
  if (preset) return preset.fontFamily;
  return `"${id}", monospace`;
}

function applyCodeThemeVars(root: CSSStyleDeclaration, theme: CodeThemeMode) {
  const darkTheme = theme === 'dark';

  root.setProperty('--code-editor-container-bg', darkTheme ? '#1e293b' : '#f1f5f9');
  root.setProperty('--code-editor-bg', darkTheme ? '#0f172a' : '#ffffff');
  root.setProperty('--code-editor-text', darkTheme ? '#e2e8f0' : '#1e293b');
  root.setProperty('--code-editor-gutter-text', darkTheme ? '#94a3b8' : '#64748b');
  root.setProperty('--code-preview-keyword', darkTheme ? '#c678dd' : '#7c3aed');
  root.setProperty('--code-preview-name', darkTheme ? '#e06c75' : '#dc2626');
  root.setProperty('--code-preview-string', darkTheme ? '#98c379' : '#15803d');
  root.setProperty('--code-preview-function', darkTheme ? '#61afef' : '#2563eb');
}

// Apply all CSS custom properties to document root
function applyCssVars(s: AppSettings) {
  const root = document.documentElement.style;
  root.setProperty('--editor-font-family', resolveEditorFont(s.editorFontFamily));
  root.setProperty('--code-font-family', resolveCodeFont(s.codeFontFamily));
  root.setProperty('--editor-line-height', `${s.editorLineHeight}`);
  // Editor surface paddings — picked up by the Minimal theme via
  // `padding: var(--editor-pad-top) var(--editor-pad-x) ...`.
  root.setProperty('--editor-pad-top', `${s.editorPaddingTop ?? 16}px`);
  root.setProperty('--editor-pad-bottom', `${s.editorPaddingBottom ?? 32}px`);
  root.setProperty('--editor-pad-x', `${s.editorPaddingX ?? 24}px`);
  applyCodeThemeVars(root, s.codeTheme);
}

// Build the active format list (builtins + optional custom) and the resolved
// write/read formats from the current settings shape. Used both at initial
// load and inside the deep watcher above so the parser/serialiser stay in
// sync with whatever the user just selected.
export function listAllMermaidFormats(s: AppSettings): MermaidFormat[] {
  const out: MermaidFormat[] = [...BUILTIN_MERMAID_FORMATS];
  const custom = s.customMermaidFormat;
  if (custom && typeof custom.open === 'string' && typeof custom.close === 'string'
      && custom.open.trim() && custom.close.trim()) {
    out.push({
      id: CUSTOM_FORMAT_ID,
      open: custom.open.trim(),
      close: custom.close.trim(),
      label: 'Custom',
      builtin: false,
    });
  }
  return out;
}

export function resolveMermaidWriteFormat(s: AppSettings): MermaidFormat {
  const all = listAllMermaidFormats(s);
  const picked = findFormatById(all, s.mermaidWriteFormatId);
  if (picked && isValidFormat(picked)) return picked;
  return BUILTIN_MERMAID_FORMATS[0];
}

export function resolveMermaidReadFormats(s: AppSettings): MermaidFormat[] {
  const all = listAllMermaidFormats(s);
  const ids = Array.isArray(s.enabledReadFormatIds) ? s.enabledReadFormatIds : [];
  const enabled = all.filter((f) => ids.includes(f.id));
  if (enabled.length === 0) return [BUILTIN_MERMAID_FORMATS[0]];
  return enabled;
}

function applyMermaidFormats(s: AppSettings): void {
  setCurrentMermaidWriteFormat(resolveMermaidWriteFormat(s));
  setCurrentMermaidReadFormats(resolveMermaidReadFormats(s));
}

watch(settings, (s) => {
  applyMermaidFormats(s);
}, { deep: true, immediate: false });

// Apply theme and CSS vars on initial load
setCurrentMermaidDelimiters({
  open: settings.value.mermaidFenceOpen,
  close: settings.value.mermaidFenceClose,
});
applyMermaidFormats(settings.value);
applyTheme(settings.value.theme);
applyThemeVariant(settings.value.themeVariant);
applyCssVars(settings.value);
