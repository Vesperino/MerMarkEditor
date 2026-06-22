<script setup lang="ts">
import { ref, provide, computed, watchEffect, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { writeTextFile, exists, readTextFile, remove } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { htmlToMarkdown, detectLineEnding, applyLineEnding, markdownToHtml } from './utils/markdown-converter';
import { inlineMarkdownImages, getDirectoryFromFilePath } from './utils/image-resolver';
import type { Editor as TiptapEditor } from '@tiptap/vue-3';

// Components
import Toolbar from './components/Toolbar.vue';
import StatusBar from './components/StatusBar.vue';
import LeftBar from './components/LeftBar.vue';
import LoadingOverlay from './components/LoadingOverlay.vue';
import ExternalLinkDialog from './components/ExternalLinkDialog.vue';
import UpdateDialog from './components/UpdateDialog.vue';
import CodeEditor from './components/CodeEditor.vue';
import Editor from './components/Editor.vue';
import SaveConfirmDialog from './components/SaveConfirmDialog.vue';
import SplitContainer from './components/SplitContainer.vue';
import TabBar from './components/TabBar.vue';
import DiffPreview from './components/DiffPreview.vue';
import TableOfContents from './components/TableOfContents.vue';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal.vue';
import SettingsModal from './components/SettingsModal.vue';
import WhatsNewModal from './components/WhatsNewModal.vue';
import ChangelogModal from './components/ChangelogModal.vue';
import WorkspaceSidebar from './components/WorkspaceSidebar.vue';
import WorkspaceQuickSwitcher from './components/WorkspaceQuickSwitcher.vue';
import DocumentSearchBar from './components/DocumentSearchBar.vue';
import AiPanel from './components/ai/AiPanel.vue';
import AiFirstRunTooltip from './components/ai/AiFirstRunTooltip.vue';
import AiTmpRecoveryModal from './components/ai/AiTmpRecoveryModal.vue';
import ToastNotification from './components/ToastNotification.vue';
import FileConflictModal from './components/FileConflictModal.vue';

// Composables
import { useAutoUpdate } from './composables/useAutoUpdate';
import { useCodeView } from './composables/useCodeView';
import { useSplitEditor } from './composables/useSplitEditor';
import { useScrollSync } from './composables/useScrollSync';
import { useSettings } from './composables/useSettings';
import { useSplitView } from './composables/useSplitView';
import { useFileOperations } from './composables/useFileOperations';
import { useCloseConfirmation } from './composables/useCloseConfirmation';
import { useWindowManager } from './composables/useWindowManager';
import { useTabDrag } from './composables/useTabDrag';
import { useEditorZoom } from './composables/useEditorZoom';
import { useFileReload } from './composables/useFileReload';
import { useLayoutConfig } from './composables/useLayoutConfig';
import { useSessionRestore } from './composables/useSessionRestore';
import { useRecentFiles } from './composables/useRecentFiles';
import { useWorkspace } from './composables/useWorkspace';
import { useAiMermaidTarget } from './composables/useAiMermaidTarget';
import { useDocumentSearch, type DocumentSearchMatch, type VisualSearchMatch } from './composables/useDocumentSearch';
import { useImageDrop } from './composables/useImageDrop';
import { isImageFile } from './utils/image-file-utils';
import { t } from './i18n';
import PdfExportDialog from './components/PdfExportDialog.vue';
import MarpPreviewDialog from './components/MarpPreviewDialog.vue';
import MarpToolbar from './components/MarpToolbar.vue';
import MarpLivePreview from './components/MarpLivePreview.vue';
import NewFileModal from './components/NewFileModal.vue';
import { getFrontmatterKey, setFrontmatterKey, removeFrontmatterKey } from './utils/frontmatter';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { usePdfExport } from './composables/usePdfExport';
import { useDocxExport } from './composables/useDocxExport';
import { serializeEditorContent } from './utils/documentSerializer';
import { DOM_SELECTORS } from './constants';

// ============ Split View & Tab Management ============
const {
  splitState,
  activePaneId,
  activePane,
  isSplitActive,
  toggleSplit,
  createTab,
  closeTab: closeTabFromSplit,
  switchTab,
  findTabByFilePath: findTabByFilePathSplit,
  getActiveTabForPane,
  getAllUnsavedTabs,
  isWindowEmpty,
  disableSplit,
} = useSplitView();

const { getSavedSession, startWatching: startSessionWatching } = useSessionRestore(splitState);
const { addRecentFile } = useRecentFiles();

const {
  closeCurrentWindow,
  registerOpenFile,
  unregisterOpenFile,
  unregisterWindowFiles,
  checkFileOpen,
  focusWindowWithFile,
  onFocusFile,
  getCurrentWindowLabel,
} = useWindowManager();

// Compatibility layer for legacy code
const tabs = computed(() => activePane.value?.tabs || []);
const activeTabId = computed(() => activePane.value?.activeTabId || '');
const activeTab = computed(() => {
  const tab = getActiveTabForPane(activePaneId.value);
  // Return a default tab if none exists (should never happen in practice)
  return tab || { id: '', filePath: null, fileName: t.value.newDocument, content: '<p></p>', hasChanges: false, scrollTop: 0, originalMarkdown: null };
});

// ============ Editor References ============
const splitContainerRef = ref<InstanceType<typeof SplitContainer> | null>(null);
// Start as true to prevent initial change detection from marking document as changed
const isLoadingContent = ref(true);

const editorInstance = ref<TiptapEditor | null>(null);

// Provide editor to child components (get from active pane)
// Use watchEffect to automatically re-run when any reactive dependency changes
// This handles async editor initialization properly
watchEffect(() => {
  if (splitContainerRef.value) {
    const paneRef = activePaneId.value === 'left'
      ? splitContainerRef.value.leftPaneRef
      : splitContainerRef.value.rightPaneRef;
    // Vue automatically unwraps ComputedRef from defineExpose, so paneRef.editor is already Editor | undefined
    const editor = paneRef?.editor;
    if (editor) {
      editorInstance.value = editor;
    }
  }
});

provide('editor', editorInstance);

// ============ Computed Properties ============
const currentFile = computed(() => activeTab.value?.filePath || null);
const hasChanges = computed(() => activeTab.value?.hasChanges || false);

provide('currentFile', currentFile);
provide('hasChanges', hasChanges);

// ============ Window Title ============
const windowTitle = computed(() => {
  const fileName = activeTab.value?.fileName || t.value.newDocument;
  const changeIndicator = activeTab.value?.hasChanges ? ' *' : '';
  return `${fileName}${changeIndicator} - MdReader`;
});

watchEffect(() => {
  document.title = windowTitle.value;
});

// ============ Tab Operations (with editor integration) ============
const getEditorContent = () => {
  if (splitContainerRef.value) {
    return splitContainerRef.value.getActiveEditorContent();
  }
  return '<p></p>';
};

const setEditorContent = (content: string) => {
  if (splitContainerRef.value) {
    isLoadingContent.value = true;
    splitContainerRef.value.setActiveEditorContent(content);
    nextTick(() => {
      isLoadingContent.value = false;
    });
  }
};

const switchToTab = async (tabId: string) => {
  // Save current scroll position for active pane
  const editorContainer = document.querySelector('.editor-pane.active .editor-container');
  if (editorContainer && activePane.value) {
    activePane.value.scrollTop = editorContainer.scrollTop;
  }

  const targetTab = tabs.value.find(t => t.id === tabId);
  const targetScrollTop = targetTab?.scrollTop || 0;

  // Switch tab in the active pane
  switchTab(activePaneId.value, tabId);

  // Restore scroll position after content is loaded
  await nextTick();
  const newContainer = document.querySelector('.editor-pane.active .editor-container');
  if (newContainer) {
    newContainer.scrollTop = targetScrollTop;
  }
};

// Create new tab in active pane
const createNewTab = (filePath?: string | null, content?: string, fileName?: string): string => {
  return createTab(activePaneId.value, filePath, content, fileName);
};

// Create a new empty document — exit code view first to commit edits
const showNewFileModal = ref(false);

function buildMarpSeed(): string {
  return `---\nmarp: true\ntheme: gaia\npaginate: true\n---\n\n# ${t.value.marpSeedTitle}\n\n## ${t.value.marpSeedSubtitle}\n`;
}

const newFile = () => {
  showNewFileModal.value = true;
};

const createDocument = async (kind: 'plain' | 'marp') => {
  showNewFileModal.value = false;
  if (codeView.value) {
    await toggleCodeView();
  }
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  if (splitEditorActive.value && activeTab.value) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    activeTab.value.content = exitSplitEditor();
    activeTab.value.hasChanges = true;
  }
  if (kind === 'marp') {
    createNewTab(null, markdownToHtml(buildMarpSeed()));
  } else {
    createNewTab();
  }
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  if (splitEditorActive.value) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    enterSplitEditor(activeTab.value?.content || '<p></p>');
  }
};

// Find tab by file path across all panes
const findTabByFilePath = (filePath: string) => {
  const result = findTabByFilePathSplit(filePath);
  return result?.tab;
};

// ============ File Watcher & Reload ============
const {
  showToast, toastMessage, toastType, dismissToast,
  showConflictModal, conflictFileName, conflictFilePath, conflictDiffLines, conflictDiffStats,
  handleConflictKeepLocal, handleConflictLoadExternal, handleConflictMerge,
  manualReload,
  reloadTabContent,
  watchFile, unwatchFile, unwatchAll, markSaveStart, markSaveEnd,
} = useFileReload({
  activePaneId,
  currentFile,
  hasChanges,
  findTabByFilePathSplit,
  setEditorContent,
});

// ============ Pre-Save Conflict Modal ============
// Shown when the user tries to save but the file was modified externally since last load/save.
// Reuses FileConflictModal with "Save Anyway" as the left-button label.
const showPreSaveConflictModal = ref(false);
const preSaveConflictFilePath = ref('');
const preSaveConflictFileName = ref('');
const preSaveConflictDiffLines = ref<import('./composables/useDiffPreview').DiffLine[]>([]);
const preSaveConflictDiffStats = ref<import('./composables/useDiffPreview').DiffStats>({ additions: 0, deletions: 0 });
const preSaveConflictDiskContent = ref('');
let preSaveConflictResolver: ((decision: 'save' | 'cancel' | string) => void) | null = null;

const handlePreSaveConflictSaveAnyway = () => {
  showPreSaveConflictModal.value = false;
  preSaveConflictResolver?.('save');
  preSaveConflictResolver = null;
};

const handlePreSaveConflictLoadExternal = () => {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  reloadTabContent(preSaveConflictFilePath.value, preSaveConflictDiskContent.value);
  showPreSaveConflictModal.value = false;
  preSaveConflictResolver?.('cancel');
  preSaveConflictResolver = null;
};

const handlePreSaveConflictMerge = (mergedContent: string) => {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  reloadTabContent(preSaveConflictFilePath.value, mergedContent);
  showPreSaveConflictModal.value = false;
  // Pass merged content to writeAndUpdateTab — it will use it as the save content
  preSaveConflictResolver?.(mergedContent);
  preSaveConflictResolver = null;
};

const handlePreSaveConflictCancel = () => {
  showPreSaveConflictModal.value = false;
  preSaveConflictResolver?.('cancel');
  preSaveConflictResolver = null;
};

// ============ Tab Close Confirmation ============
const showTabCloseDialog = ref(false);
const tabToClose = ref<{ id: string; paneId: string; fileName: string } | null>(null);

const closeTabAndCheckWindow = async (paneId: string, tabId: string) => {
  // Get the file path before closing to unregister it
  const pane = splitState.value.panes.find(p => p.id === paneId);
  const tab = pane?.tabs.find(t => t.id === tabId);
  const filePath = tab?.filePath;

  closeTabFromSplit(paneId, tabId);

  // Unregister the file from the global registry and stop watching
  if (filePath) {
    unwatchFile(filePath);
    try {
      await unregisterOpenFile(filePath);
    } catch (error) {
      console.error('[App] Error unregistering file:', error);
    }
  }

  if (isWindowEmpty()) {
    if (workspace.openWorkspaces.value.length === 0) {
      await closeCurrentWindow();
      return;
    }
    if (isSplitActive.value) {
      disableSplit();
    }
    return;
  }

  if (isSplitActive.value) {
    const paneAfter = splitState.value.panes.find(p => p.id === paneId);
    if (paneAfter && paneAfter.tabs.length === 0) {
      disableSplit();
    }
  }
};

const handleCloseTabRequest = (paneId: string, tabId: string) => {
  const pane = splitState.value.panes.find(p => p.id === paneId);
  const tab = pane?.tabs.find(t => t.id === tabId);

  if (tab?.hasChanges) {
    tabToClose.value = { id: tabId, paneId, fileName: tab.fileName };
    showTabCloseDialog.value = true;
    return;
  }
  closeTabAndCheckWindow(paneId, tabId);
};

// ===== Tab pinning + bulk close =====

function handleTabTogglePin(paneId: string, tabId: string) {
  const pane = splitState.value.panes.find((p) => p.id === paneId);
  if (!pane) return;
  const tab = pane.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  tab.pinned = !tab.pinned;

  // Keep pinned tabs at the front of the tab bar (Chrome / VS Code style).
  // After toggling, move the tab so the layout is `[pinned…, unpinned…]`:
  //   - pin:  insert at end of the pinned block
  //   - unpin: insert at the head of the unpinned block (right after the
  //     last still-pinned tab)
  const currentIdx = pane.tabs.findIndex((t) => t.id === tabId);
  if (currentIdx === -1) return;
  pane.tabs.splice(currentIdx, 1);
  const pinnedCount = pane.tabs.filter((t) => t.pinned).length;
  // After the splice, both branches drop the tab at index `pinnedCount`
  // — the boundary between pinned and unpinned blocks.
  pane.tabs.splice(pinnedCount, 0, tab);
}

/** Close every tab in a pane that satisfies `predicate`. Pinned tabs and
 *  the (still currently displayed) target tab can be excluded by the
 *  caller. Reuses `handleCloseTabRequest` so unsaved-change prompts still
 *  fire one-at-a-time per affected tab. */
async function bulkCloseTabs(
  paneId: string,
  predicate: (tab: { id: string; pinned?: boolean; hasChanges: boolean }) => boolean,
) {
  const pane = splitState.value.panes.find((p) => p.id === paneId);
  if (!pane) return;
  // Snapshot ids first — closing mutates the array.
  const targets = pane.tabs.filter(predicate).map((t) => t.id);
  for (const id of targets) {
    handleCloseTabRequest(paneId, id);
  }
}

function handleTabCloseOthers(paneId: string, keepId: string) {
  bulkCloseTabs(paneId, (t) => t.id !== keepId && !t.pinned);
}

function handleTabCloseAll(paneId: string) {
  bulkCloseTabs(paneId, () => true);
}

function handleTabCloseAllButPinned(paneId: string) {
  bulkCloseTabs(paneId, (t) => !t.pinned);
}

function handleTabCloseSaved(paneId: string) {
  bulkCloseTabs(paneId, (t) => !t.hasChanges && !t.pinned);
}

const handleTabCloseSave = async () => {
  if (!tabToClose.value) return;

  const pane = splitState.value.panes.find(p => p.id === tabToClose.value!.paneId);
  const tab = pane?.tabs.find(t => t.id === tabToClose.value!.id);

  if (tab) {
    if (activeTabId.value !== tab.id || activePaneId.value !== tabToClose.value.paneId) {
      splitState.value.activePaneId = tabToClose.value.paneId;
      await switchToTab(tab.id);
    }
    await saveFile();
    if (!tab.hasChanges) {
      showTabCloseDialog.value = false;
      const closePaneId = tabToClose.value.paneId;
      const closeTabId = tabToClose.value.id;
      tabToClose.value = null;
      await closeTabAndCheckWindow(closePaneId, closeTabId);
    }
  }
};

const handleTabCloseDiscard = async () => {
  if (!tabToClose.value) return;

  const pane = splitState.value.panes.find(p => p.id === tabToClose.value!.paneId);
  const tab = pane?.tabs.find(t => t.id === tabToClose.value!.id);

  if (tab) {
    tab.hasChanges = false;
  }
  showTabCloseDialog.value = false;
  const closePaneId = tabToClose.value.paneId;
  const closeTabId = tabToClose.value.id;
  tabToClose.value = null;
  await closeTabAndCheckWindow(closePaneId, closeTabId);
};

const handleTabCloseCancel = () => {
  showTabCloseDialog.value = false;
  tabToClose.value = null;
};

// ============ File Operations ============
const {
  isLoadingFile,
  showExternalLinkDialog,
  pendingExternalUrl,
  openFileFromPath,
  saveFile,
  saveFileAs,
  handleLinkClick,
  confirmExternalLink,
  cancelExternalLink,
} = useFileOperations({
  tabs,
  activeTabId,
  activeTab,
  findTabByFilePath,
  createNewTab,
  switchToTab,
  getEditorHtml: getEditorContent,
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  getMarkdownOverride: () => {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if (splitEditorActive.value) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return splitSourceTabId.value === activeTabId.value ? splitMarkdownSource.value : null;
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return codeView.value ? codeContent.value : null;
  },
  setEditorContent,
  markSaveStart: (filePath: string) => markSaveStart(filePath),
  markSaveEnd: (filePath: string, content: string) => markSaveEnd(filePath, content),
  onFileOpened: (filePath: string, content: string) => {
    watchFile(filePath, content);
    const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
    addRecentFile(filePath, fileName);
    // Only the same-tab content-replacement case; tab-id changes are seeded by
    // the activeTabId watch, and this tag guard avoids a double-seed race.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if (splitEditorActive.value && splitSourceTabId.value === activeTabId.value) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      enterSplitEditor(activeTab.value?.content || '<p></p>');
    }
  },
  onAfterSave: (filePath: string, content: string) => {
    // New file just got a path (Save / Save As on a fresh tab) — ensure
    // the file watcher is registered so external edits (e.g., AI) are
    // detected and trigger an editor reload.
    watchFile(filePath, content);
  },
  onPreSaveConflict: (filePath: string, diskContent: string, localMarkdown: string) => {
    const tab = findTabByFilePath(filePath);
    // Diff shows local (current editor) → disk so the user sees their changes vs external changes.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const diffResult = generateDiff(localMarkdown, diskContent);
    preSaveConflictFilePath.value = filePath;
    preSaveConflictFileName.value = tab?.fileName ?? filePath.split(/[/\\]/).pop() ?? filePath;
    preSaveConflictDiffLines.value = diffResult.lines;
    preSaveConflictDiffStats.value = diffResult.stats;
    preSaveConflictDiskContent.value = diskContent;
    showPreSaveConflictModal.value = true;
    return new Promise<'save' | 'cancel' | string>((resolve) => {
      preSaveConflictResolver = resolve;
    });
  },
});

// ============ PDF Export ============
const showPdfDialog = ref(false);
const pdfContentHtml = ref('');
const pdfMeta = ref<{ title?: string; path?: string; date?: string }>({});
const { exportDocx } = useDocxExport();
usePdfExport();

function openPdfDialog() {
  const editorEl =
    document.querySelector<HTMLElement>(
      `${DOM_SELECTORS.ACTIVE_EDITOR_CONTAINER} .ProseMirror`,
    ) ?? document.querySelector<HTMLElement>('.ProseMirror');
  if (!editorEl) return;
  pdfContentHtml.value = serializeEditorContent(editorEl);
  const tab = activeTab.value;
  const fileName = tab?.fileName ?? '';
  const filePath = tab?.filePath ?? '';
  const title = fileName.replace(/\.(md|markdown)$/i, '') || 'Dokument';
  pdfMeta.value = {
    title,
    path: filePath,
    date: new Date().toLocaleDateString(),
  };
  showPdfDialog.value = true;
}

// ============ Marp Presentation ============
const showMarpDialog = ref(false);
const marpMarkdown = ref('');
const marpTitle = ref('deck');

async function openMarpDialog() {
  const tab = activeTab.value;
  const fileName = tab?.fileName ?? '';
  marpTitle.value = fileName.replace(/\.(md|markdown)$/i, '') || 'deck';
  // In code / split-editor modes the WYSIWYG editor is unmounted and serializes
  // to empty — read the live markdown source instead so Present isn't blank.
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const override = splitEditorActive.value
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    ? (splitSourceTabId.value === activeTabId.value ? splitMarkdownSource.value : null)
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    : (codeView.value ? codeContent.value : null);
  const raw = override ?? htmlToMarkdown(getEditorContent() ?? '');
  // Inline local images as data URIs: the deck renders inside a sandboxed
  // iframe (srcdoc) with no base URL, so relative/local paths won't load.
  const baseDir = tab?.filePath ? getDirectoryFromFilePath(tab.filePath) : undefined;
  marpMarkdown.value = await inlineMarkdownImages(raw, baseDir);
  showMarpDialog.value = true;
}

// Marp mode = active doc has a `marp: true` front-matter badge node.
const isMarp = computed(() => (activeTab.value?.content || '').includes('data-marp="true"'));

// Run a callback against the active WYSIWYG editor instance (null in code view).
function withMarpEditor(fn: (ed: TiptapEditor) => void) {
  const ed = splitContainerRef.value?.getActiveEditor?.() as TiptapEditor | null | undefined;
  if (ed) fn(ed);
}

// value === null removes the key (back to theme default).
function marpUpdateFrontmatter(key: string, value: string | null) {
  withMarpEditor((ed) => {
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'marpFrontmatter') return true;
      const cur = (node.attrs.raw as string) || '';
      const raw = value === null ? removeFrontmatterKey(cur, key) : setFrontmatterKey(cur, key, value);
      ed.chain().focus().command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, raw });
        return true;
      }).run();
      return false;
    });
  });
}

// Global slide font size via the `style:` directive. Marp clips overflow (no
// auto-shrink), so a smaller font is the lever to fit more on a slide. px<=0
// removes the override (theme default).
function marpSetFont(px: number) {
  marpUpdateFrontmatter('style', px > 0 ? `section { font-size: ${px}px; }` : null);
}

function marpNewSlide() {
  withMarpEditor((ed) => ed.chain().focus().setHorizontalRule().run());
}

// Set the current slide's `_class` layout: replaces any existing `_class`
// directive(s) in this slide instead of stacking new ones; an empty value
// removes the layout (back to default). "Current slide" = the run of top-level
// blocks around the cursor, bounded by horizontal-rule slide separators.
function marpSetLayout(value: string) {
  withMarpEditor((ed) => {
    const { state } = ed;
    const head = state.selection.head;
    const kids: { node: import('@tiptap/pm/model').Node; pos: number }[] = [];
    state.doc.forEach((node, offset) => kids.push({ node, pos: offset }));
    if (kids.length === 0) return;

    let cur = kids.findIndex((k) => head >= k.pos && head <= k.pos + k.node.nodeSize);
    if (cur === -1) cur = kids.length - 1;

    let startIdx = cur;
    while (startIdx > 0 && kids[startIdx - 1].node.type.name !== 'horizontalRule') startIdx--;
    let endIdx = cur;
    while (endIdx < kids.length - 1 && kids[endIdx + 1].node.type.name !== 'horizontalRule') endIdx++;

    // Insert position = slide start, but after a leading front-matter node.
    const first = kids[startIdx];
    const slideStart =
      first.node.type.name === 'marpFrontmatter' ? first.pos + first.node.nodeSize : first.pos;

    const existing = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const k = kids[i];
      if (k.node.type.name === 'marpDirective' && /^_class\s*:/.test((k.node.attrs.raw as string) || '')) {
        existing.push(k);
      }
    }

    let tr = state.tr;
    // Delete existing _class directives (descending so positions stay valid).
    for (let i = existing.length - 1; i >= 0; i--) {
      tr = tr.delete(existing[i].pos, existing[i].pos + existing[i].node.nodeSize);
    }
    // slideStart <= every existing pos, so it is unaffected by the deletions.
    if (value) {
      tr = tr.insert(slideStart, state.schema.nodes.marpDirective.create({ raw: `_class: ${value}` }));
    }
    if (tr.docChanged) {
      ed.view.dispatch(tr);
      ed.view.focus();
    }
  });
}

function marpTogglePaginate() {
  withMarpEditor((ed) => {
    let cur = 'false';
    ed.state.doc.descendants((node) => {
      if (node.type.name === 'marpFrontmatter') {
        cur = getFrontmatterKey((node.attrs.raw as string) || '', 'paginate') ?? 'false';
        return false;
      }
      return true;
    });
    const enabled = /^true\b/i.test(cur.trim());
    marpUpdateFrontmatter('paginate', enabled ? 'false' : 'true');
  });
}

async function marpInsertBg(opts: { source: 'local' | 'url'; pos: string }) {
  const alt = `bg ${opts.pos}`.trim();
  let src: string;
  if (opts.source === 'local') {
    const picked = await openFileDialog({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    });
    if (typeof picked !== 'string') return;
    src = picked;
  } else {
    const url = window.prompt(t.value.imagePrompt);
    if (!url) return;
    src = url.trim();
  }
  withMarpEditor((ed) => ed.chain().focus().setImage({ src, alt }).run());
}

// ---- Marp live preview pane (editor left, rendered slides right, synced) ----
const showMarpPreview = ref(false);
const marpLiveMarkdown = ref('');
const marpLivePreviewRef = ref<InstanceType<typeof MarpLivePreview> | null>(null);
const marpScrollSync = useScrollSync();
let marpLiveTimer: ReturnType<typeof setTimeout> | null = null;

// Visible only in the plain WYSIWYG editor mode for a Marp doc.
const marpPreviewVisible = computed(
  () => showMarpPreview.value && isMarp.value && !codeView.value && !splitEditorActive.value
);

async function refreshMarpLive() {
  const tab = activeTab.value;
  const raw = htmlToMarkdown(getEditorContent() ?? '');
  const baseDir = tab?.filePath ? getDirectoryFromFilePath(tab.filePath) : undefined;
  marpLiveMarkdown.value = await inlineMarkdownImages(raw, baseDir);
}

function scheduleMarpLive() {
  if (marpLiveTimer) clearTimeout(marpLiveTimer);
  marpLiveTimer = setTimeout(refreshMarpLive, 300);
}

function attachMarpScroll() {
  const codeEl =
    document.querySelector<HTMLElement>('.editor-pane.active .editor-container') ||
    document.querySelector<HTMLElement>('.editor-area .editor-container');
  const prevEl = marpLivePreviewRef.value?.scrollEl as HTMLElement | null | undefined;
  if (codeEl && prevEl) marpScrollSync.attach(codeEl, prevEl);
}

async function toggleMarpPreview() {
  showMarpPreview.value = !showMarpPreview.value;
  if (showMarpPreview.value) {
    await refreshMarpLive();
    await nextTick();
    attachMarpScroll();
  } else {
    marpScrollSync.detach();
  }
}

watch(() => activeTab.value?.content, () => {
  if (marpPreviewVisible.value) scheduleMarpLive();
});

// Re-attach scroll-sync when the pane shows or the active pane changes; detach
// when hidden by a mode change. (attach() detaches first, so no duplicate listeners.)
watch([marpPreviewVisible, activePaneId], async () => {
  if (marpPreviewVisible.value) {
    await refreshMarpLive();
    await nextTick();
    attachMarpScroll();
  } else {
    marpScrollSync.detach();
  }
});

// ============ Code View ============
const codeEditorComponentRef = ref<InstanceType<typeof CodeEditor> | null>(null);

const {
  codeView,
  codeContent,
  codeEditorRef,
  toggleCodeView: toggleCodeViewBase,
  onCodeContentUpdate,
} = useCodeView({
  getActiveContent: () => activeTab.value?.content || '<p></p>',
  setActiveContent: (content: string) => {
    if (activeTab.value) {
      activeTab.value.content = content;
    }
  },
  markAsChanged: () => {
    if (activeTab.value) {
      activeTab.value.hasChanges = true;
    }
  },
});

// Sync code editor ref with component's textarea
watch(
  () => codeEditorComponentRef.value?.textarea,
  (textarea) => {
    if (textarea) {
      codeEditorRef.value = textarea;
    }
  },
  { immediate: true }
);

const toggleCodeView = async () => {
  isLoadingContent.value = true;

  if (!codeView.value) {
    splitContainerRef.value?.getActiveVisualSearchApi?.()?.clearSearchHighlights();
  }

  // Cast to satisfy type checker - the types are compatible
  // useCodeView now handles setContent and cursor restoration internally
  await toggleCodeViewBase(editorInstance.value as Parameters<typeof toggleCodeViewBase>[0]);

  await nextTick();
  isLoadingContent.value = false;
};

// ============ Split Editor (code + live preview of the same document) ============
const {
  splitEditorActive,
  markdownSource: splitMarkdownSource,
  previewHtml: splitPreviewHtml,
  onMarkdownInput: onSplitMarkdownInput,
  syncFromVisual: syncSplitFromVisual,
  enter: enterSplitEditorRaw,
  exit: exitSplitEditor,
} = useSplitEditor();

// Proportional scroll-sync between the split code pane and the live preview.
const scrollSync = useScrollSync();

// Latest HTML emitted by the read-only preview editor. Committed back to the
// code source only on a real in-preview edit (see onSplitPreviewChanged).
const splitPreviewLatestHtml = ref('');

// Tags splitMarkdownSource with the tab it was seeded from so the WRITE paths
// can refuse to persist a source belonging to a different tab.
const splitSourceTabId = ref<string | null>(null);

const enterSplitEditor = (html: string): void => {
  enterSplitEditorRaw(html);
  splitSourceTabId.value = activeTabId.value;
};

// Single authoritative commit + re-seed for every active-tab change, covering
// every open/switch path (cross-window already-open, focus listener, dropped
// files, normal TabBar) uniformly.
//
// TIMING: nothing may overwrite splitMarkdownSource synchronously between the
// activeTabId change and this flush, or the commit-old step would persist the
// new edit into the old tab. This is why manual enter/exit seeding was removed
// from switchToTabFromSplitEditor and onFileOpened.
watch(activeTabId, (_newId, oldId) => {
  if (!splitEditorActive.value) return;
  if (splitSourceTabId.value === oldId) {
    const oldIndex = tabs.value.findIndex(t => t.id === oldId);
    if (oldIndex !== -1) {
      tabs.value[oldIndex].content = markdownToHtml(splitMarkdownSource.value);
      tabs.value[oldIndex].hasChanges = true;
    }
  }
  enterSplitEditor(activeTab.value?.content || '<p></p>');
});

const toggleSplitEditor = async () => {
  if (!splitEditorActive.value) {
    if (codeView.value) {
      await toggleCodeView();
    }
    // Read the live editor HTML so the latest (still-debounced) edit isn't lost
    // when seeding the markdown source.
    const html = editorInstance.value?.getHTML() ?? activeTab.value?.content ?? '<p></p>';
    if (activeTab.value) {
      activeTab.value.content = html;
    }
    isLoadingContent.value = true;
    enterSplitEditor(html);
    splitEditorActive.value = true;
    await nextTick();
    const codeEl = document.querySelector<HTMLElement>('#code-editor-textarea');
    const previewEl = document.querySelector<HTMLElement>('.split-editor-preview .editor-container');
    if (codeEl && previewEl) scrollSync.attach(codeEl, previewEl);
    isLoadingContent.value = false;
    return;
  }

  scrollSync.detach();
  const html = exitSplitEditor();
  if (activeTab.value) {
    activeTab.value.content = html;
    activeTab.value.hasChanges = true;
  }
  isLoadingContent.value = true;
  splitEditorActive.value = false;
  await nextTick();
  isLoadingContent.value = false;
};

const handleSplitMarkdownInput = (value: string) => {
  onSplitMarkdownInput(value);
  if (activeTab.value) {
    activeTab.value.hasChanges = true;
  }
};

// Fires only for genuine in-preview edits (Mermaid diagram apply, manual node
// edit) — the preview's setContent push suppresses hasChanges, so this never
// echoes a code edit. Propagates the diagram change back into the code source.
const onSplitPreviewChanged = (changed: boolean) => {
  if (!changed || !splitEditorActive.value) return;
  syncSplitFromVisual(splitPreviewLatestHtml.value);
  if (activeTab.value) {
    activeTab.value.hasChanges = true;
  }
};

// ============ Current Document Search ============
const documentSearchBarRef = ref<InstanceType<typeof DocumentSearchBar> | null>(null);

const getCodeTextarea = (): HTMLTextAreaElement | null => {
  return (codeEditorComponentRef.value?.textarea as HTMLTextAreaElement | null | undefined) ?? null;
};

// ============ Image Drag & Drop ============
const { handleDrop: handleImageDrop } = useImageDrop({
  codeView,
  codeEditorTextarea: getCodeTextarea,
  activeFilePath: () => activeTab.value?.filePath ?? null,
  findVisualTargetAt: (x, y) => splitContainerRef.value?.findVisualTargetAt?.(x, y) ?? null,
  onImagesImported: () => { void workspace.refreshAll(); },
});

const scrollCodeMatchIntoView = (textarea: HTMLTextAreaElement, match: DocumentSearchMatch) => {
  const computedStyle = window.getComputedStyle(textarea);
  const fontSize = parseFloat(computedStyle.fontSize) || 14;
  const parsedLineHeight = parseFloat(computedStyle.lineHeight);
  const lineHeight = computedStyle.lineHeight === 'normal' || Number.isNaN(parsedLineHeight)
    ? fontSize * 1.2
    : parsedLineHeight;
  const line = textarea.value.slice(0, match.start).split('\n').length - 1;
  const targetTop = Math.max(0, (line - 4) * lineHeight);
  textarea.scrollTop = targetTop;
};

const focusCodeMatch = (match: DocumentSearchMatch) => {
  const textarea = getCodeTextarea();
  if (!textarea) return;
  textarea.focus();
  textarea.setSelectionRange(match.start, match.end);
  scrollCodeMatchIntoView(textarea, match);
};

const getSelectedTextForDocumentSearch = (): string => {
  if (codeView.value) {
    const textarea = getCodeTextarea();
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) return '';
    return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  }

  const ed = editorInstance.value;
  if (ed) {
    const { from, to } = ed.state.selection;
    if (from !== to) {
      return ed.state.doc.textBetween(from, to, '\n');
    }
  }

  const selection = window.getSelection();
  const selectedText = selection?.toString() ?? '';
  if (!selectedText) return '';
  const root = document.querySelector('.editor-pane.active .ProseMirror');
  const anchor = selection?.anchorNode;
  if (root && anchor && root.contains(anchor)) return selectedText;
  return '';
};

const documentSearch = useDocumentSearch({
  getMode: () => (codeView.value ? 'code' : 'visual'),
  getCodeText: () => codeContent.value,
  getVisualTextAndMap: () => splitContainerRef.value?.getActiveVisualSearchApi?.()?.getSearchTextMap() ?? null,
  focusCodeMatch,
  focusVisualMatch: (match: VisualSearchMatch) => {
    splitContainerRef.value?.getActiveVisualSearchApi?.()?.focusSearchMatch(match);
  },
  applyVisualHighlights: (matches: VisualSearchMatch[], activeIndex: number) => {
    splitContainerRef.value?.getActiveVisualSearchApi?.()?.setSearchHighlights(matches, activeIndex);
  },
  clearVisualHighlights: () => {
    splitContainerRef.value?.getActiveVisualSearchApi?.()?.clearSearchHighlights();
  },
  focusSearchInput: () => {
    nextTick(() => documentSearchBarRef.value?.focusInput());
  },
  focusEditor: () => {
    nextTick(() => {
      if (codeView.value) {
        getCodeTextarea()?.focus();
      } else {
        editorInstance.value?.commands.focus();
      }
    });
  },
});

const openDocumentSearch = async () => {
  await documentSearch.open(getSelectedTextForDocumentSearch());
};

watch(
  [
    codeContent,
    codeView,
    activeTabId,
    activePaneId,
    () => activeTab.value?.content,
  ],
  () => {
    if (!documentSearch.state.value.open) return;
    nextTick(() => {
      documentSearch.refresh();
    });
  }
);

// Switch tab while in code view: exit code view first to commit edits, then switch
const switchToTabFromCodeView = async (tabId: string) => {
  if (codeView.value) {
    await toggleCodeView();
  }
  await switchToTab(tabId);
};

// Close tab while in code view: exit code view first to commit edits if closing the active tab
const closeTabFromCodeView = async (tabId: string) => {
  if (codeView.value && tabId === activeTabId.value) {
    await toggleCodeView();
  }
  handleCloseTabRequest(activePaneId.value, tabId);
};

const switchToTabFromSplitEditor = async (tabId: string) => {
  if (tabId === activeTabId.value) return;
  await switchToTab(tabId);
};

const closeTabFromSplitEditor = async (tabId: string) => {
  if (tabId === activeTabId.value && activeTab.value && splitSourceTabId.value === tabId) {
    activeTab.value.content = exitSplitEditor();
    activeTab.value.hasChanges = true;
  }
  handleCloseTabRequest(activePaneId.value, tabId);
  await nextTick();
  if (splitEditorActive.value) {
    enterSplitEditor(activeTab.value?.content || '<p></p>');
    splitSourceTabId.value = activeTabId.value;
  }
};

// ============ Diff Preview ============
import { useDiffPreview, generateDiff } from './composables/useDiffPreview';

const {
  showDiffPreview,
  diffPreviewLines,
  diffStats,
  diffTitle,
  canShowDiff,
  openDiffPreview,
  openComparePreview,
  closeDiffPreview,
} = useDiffPreview({
  originalMarkdown: computed(() => activeTab.value?.originalMarkdown ?? null),
  getCurrentMarkdown: () => {
    const html = getEditorContent();
    return htmlToMarkdown(html);
  },
  hasChanges,
});

const toggleDiffPreview = () => {
  if (showDiffPreview.value) {
    closeDiffPreview();
  } else {
    openDiffPreview();
  }
};

// ============ Compare Tabs ============
const canCompareTabs = computed(() => {
  if (!isSplitActive.value) return false;
  const leftTab = getActiveTabForPane('left');
  const rightTab = getActiveTabForPane('right');
  return !!(leftTab?.content && rightTab?.content);
});

const compareTabs = () => {
  const leftTab = getActiveTabForPane('left');
  const rightTab = getActiveTabForPane('right');
  if (!leftTab || !rightTab) return;

  const leftHtml = splitContainerRef.value?.getEditorContent?.('left') || leftTab.content;
  const rightHtml = splitContainerRef.value?.getEditorContent?.('right') || rightTab.content;

  const leftMd = htmlToMarkdown(leftHtml);
  const rightMd = htmlToMarkdown(rightHtml);

  openComparePreview(leftMd, rightMd, leftTab.fileName, rightTab.fileName);
};

// ============ Table of Contents ============
const showTocPanel = ref(false);
const toggleTocPanel = () => {
  showTocPanel.value = !showTocPanel.value;
};

// ============ Keyboard Shortcuts Modal ============
const showShortcutsModal = ref(false);

// ============ Settings Modal ============
const showSettingsModal = ref(false);

// ============ AI Panel ============
const aiPanelOpen = ref(false);

function toggleAiPanel() {
  aiPanelOpen.value = !aiPanelOpen.value;
}

// Auto-open the panel whenever a Mermaid node registers an AI edit target.
// The diagram pinning, preamble augmentation, and reply routing live inside
// AiPanel — App.vue just makes sure the panel is visible when work starts.
const aiMermaid = useAiMermaidTarget();
watch(
  () => aiMermaid.target.value,
  (t) => {
    if (t) aiPanelOpen.value = true;
  },
);

function onAiApplyContent(content: string) {
  // Reload-only — no auto-diff (revert flow already matches disk).
  setEditorContent(content);
  // Mark editor state as "saved" so the next file-watcher fire (we just
  // wrote the file ourselves) does not pop a conflict modal that blocks
  // subsequent Restore clicks.
  const tab = activeTab.value;
  if (tab && typeof tab === 'object' && 'originalMarkdown' in tab) {
    (tab as { originalMarkdown: string | null; hasChanges: boolean }).originalMarkdown = content;
    (tab as { originalMarkdown: string | null; hasChanges: boolean }).hasChanges = false;
  }
}

function onAiShowDiff(_orig: string, candidate: string) {
  // Write the candidate into the editor so the existing change-tracking
  // machinery computes the diff vs the on-disk original, then surface
  // the DiffPreview modal immediately.
  setEditorContent(candidate);
  nextTick(() => {
    if (canShowDiff.value) openDiffPreview();
  });
}

// Compute panel inputs from the active tab.
const aiDocPath = computed(() => activeTab.value?.filePath ?? '');
const aiDocContent = computed(() => getEditorContent() ?? '');
// Re-evaluate selection on every render tick so the AI panel sees the
// current editor/code-view selection.
const aiSelectionTick = ref(0);
// Editor selection cannot change because of clicks/keys inside the AI panel.
// Bumping the tick on every mouseup forces an AiPanel re-render between
// mouseup and click, which Chromium uses as the trigger for native <details>
// toggle — the re-render races the toggle and the chip refuses to open.
// Gate so the tick only fires when the event happens outside the AI panel.
const _bumpSelectionTick = (e?: Event) => {
  const target = e?.target as HTMLElement | null;
  if (target?.closest && target.closest('.ai-panel')) return;
  aiSelectionTick.value++;
};
if (typeof document !== 'undefined') {
  document.addEventListener('selectionchange', _bumpSelectionTick);
  document.addEventListener('keyup', _bumpSelectionTick);
  document.addEventListener('mouseup', _bumpSelectionTick);
}
const aiSelectionRange = computed<{ start: number; end: number } | null>(() => {
  aiSelectionTick.value;
  if (codeView.value) {
    const ta = codeEditorComponentRef.value?.textarea as HTMLTextAreaElement | undefined;
    if (!ta) return null;
    const { selectionStart, selectionEnd } = ta;
    if (selectionStart === selectionEnd) return null;
    return { start: selectionStart, end: selectionEnd };
  }
  const ed = editorInstance.value;
  if (!ed) return null;
  const { from, to } = ed.state.selection;
  if (from === to) return null;
  return { start: from, end: to };
});

// Extract the actual selected TEXT directly from the active editor — avoids
// the buggy 'slice docMarkdown by range' approximation, since TipTap PM
// positions do not map 1:1 to markdown char offsets, and code-view content
// may diverge from htmlToMarkdown(visual).
const aiSelectionText = computed<string>(() => {
  aiSelectionTick.value;
  if (codeView.value) {
    const ta = codeEditorComponentRef.value?.textarea as HTMLTextAreaElement | undefined;
    if (!ta) return '';
    const { selectionStart, selectionEnd, value } = ta;
    if (selectionStart === selectionEnd) return '';
    return value.slice(selectionStart, selectionEnd);
  }
  const ed = editorInstance.value;
  if (!ed) return '';
  const { from, to } = ed.state.selection;
  if (from === to) return '';
  return ed.state.doc.textBetween(from, to, '\n\n', '\n');
});
// AI workdir resolution priority:
//   1. Workspace root that owns the active file (so the AI runs from project root)
//   2. The active file's parent directory
//   3. Any active workspace root (when no file is open yet)
//   4. Empty (no scope)
// Reasoning: when the user is editing a note inside a workspace, they expect
// AI tool calls (read/write paths, bash cwd) to be scoped to the project root,
// not just the immediate folder. Standalone files keep the old behavior.
const aiWorkDir = computed(() => {
  const p = activeTab.value?.filePath;
  if (p) {
    const owning = workspace.findOwningWorkspace(p);
    if (owning) return owning.rootPath;
    const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.slice(0, idx) : p;
  }
  return workspace.activeWorkspace.value?.rootPath ?? '';
});

// AI workspace context — surfaces to the model so it understands which
// project/notebook the user is working in.
const aiWorkspaceName = computed<string>(() => {
  const p = activeTab.value?.filePath;
  const owning = p ? workspace.findOwningWorkspace(p) : null;
  return (owning ?? workspace.activeWorkspace.value)?.name ?? '';
});
const aiWorkspaceRoot = computed<string>(() => {
  const p = activeTab.value?.filePath;
  const owning = p ? workspace.findOwningWorkspace(p) : null;
  return (owning ?? workspace.activeWorkspace.value)?.rootPath ?? '';
});

// ============ AI Tmp Recovery ============
const tmpRecovery = ref<{ tmpPath: string; content: string; modifiedAt: string } | null>(null);

watch(() => activeTab.value?.filePath, async (path) => {
  if (!path) { tmpRecovery.value = null; return; }
  const tmpPath = `${path}.mermark-ai.tmp`;
  try {
    if (await exists(tmpPath)) {
      const content = await readTextFile(tmpPath);
      tmpRecovery.value = { tmpPath, content, modifiedAt: new Date().toISOString() };
    } else {
      tmpRecovery.value = null;
    }
  } catch {
    tmpRecovery.value = null;
  }
});

async function onTmpRestore() {
  if (!tmpRecovery.value) return;
  setEditorContent(tmpRecovery.value.content);
  try { await remove(tmpRecovery.value.tmpPath); } catch { /* best-effort */ }
  tmpRecovery.value = null;
}

async function onTmpDiscard() {
  if (!tmpRecovery.value) return;
  try { await remove(tmpRecovery.value.tmpPath); } catch { /* best-effort */ }
  tmpRecovery.value = null;
}

function onTmpShowDiff() {
  if (!tmpRecovery.value) return;
  setEditorContent(tmpRecovery.value.content);
  // Existing diff machinery compares vs originalMarkdown automatically.
  tmpRecovery.value = null;
}

// ============ What's New Modal ============
const showWhatsNewModal = ref(false);
const showChangelogModal = ref(false);
const changelogInitialVersion = ref<string | null>(null);

const handleOpenChangelog = async () => {
  try {
    changelogInitialVersion.value = await getVersion();
  } catch {
    changelogInitialVersion.value = null;
  }
  showWhatsNewModal.value = false;
  showChangelogModal.value = true;
};

// ============ Auto Update ============
const {
  showUpdateDialog,
  updateInfo,
  updateProgress,
  isUpdating,
  updateError,
  checkForUpdates,
  downloadAndInstallUpdate,
  closeUpdateDialog,
} = useAutoUpdate();

// ============ Settings ============
const { settings } = useSettings();

// ============ Workspace ============
const workspace = useWorkspace();
const insertImageIntoActivePane = (path: string) => {
  const paneEl = document.querySelector<HTMLElement>(`.editor-pane.active`)
    ?? document.querySelector<HTMLElement>('.editor-pane');
  const rect = paneEl?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  const dpr = window.devicePixelRatio || 1;
  void handleImageDrop([path], { x: x * dpr, y: y * dpr });
};

// Triggered by the workspace tree's double-click (single click only selects
// the row now). Markdown opens as a tab; images intentionally noop — the user
// inserts them by dragging into the editor, which keeps select / insert
// gestures distinct and prevents accidental document mutation on dblclick.
const handleWorkspaceOpenFile = (path: string) => {
  if (isImageFile(path)) return;
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  openFileWithCrossWindowCheck(path).catch((e) => console.error('[App] open from workspace:', e));
};

/**
 * OS files dropped onto the editor that aren't images (md/txt/markdown).
 * With Tauri's dragDropEnabled=false we receive the browser File objects but
 * no absolute path, so we read the text and open each as a fresh unsaved tab
 * in the active pane. The user gives it a real path on first Save.
 */
const handleOpenDroppedFiles = async (files: File[]) => {
  for (const file of files) {
    const name = file.name.toLowerCase();
    const isText = /\.(md|markdown|txt|mermark)$/.test(name) || file.type.startsWith('text/');
    if (!isText) continue;
    try {
      const text = await file.text();
      const html = markdownToHtml(text);
      createNewTab(null, html, file.name);
    } catch (e) {
      console.error('[App] open dropped file:', file.name, e);
    }
  }
};

const handleWorkspaceDropFile = (paneId: string, path: string) => {
  splitState.value.activePaneId = paneId;
  if (isImageFile(path)) {
    insertImageIntoActivePane(path);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  openFileWithCrossWindowCheck(path).catch((e) => console.error('[App] drop file in pane:', e));
};
const handleOpenWorkspaceFromToolbar = () => {
  workspace.openWorkspaceDialog().catch((e) => console.error('[App] open workspace dialog:', e));
};
const handleOpenRecentWorkspaceFromToolbar = (rootPath: string) => {
  workspace.openWorkspace(rootPath).catch((e) => console.error('[App] open recent workspace:', e));
};

// Quick-switcher modal state. Triggered from sidebar search icon or Ctrl+Shift+E.
const showWorkspaceQuickSwitcher = ref(false);

// Sync the active tab's file path into the workspace tree highlight so the
// sidebar reveals (and scrolls to) whichever file the user is editing.
watch(
  () => activeTab.value?.filePath,
  (path) => {
    workspace.setHighlightedPath(path ?? null);
  },
  { immediate: true },
);

// Mirror unsaved-tab state into the workspace tree so dirty files show a
// marker. Watches every pane's tabs (filePath + hasChanges) and republishes
// the set of dirty paths whenever it changes.
watch(
  () => splitState.value.panes.flatMap((p) =>
    p.tabs.filter((tb) => tb.hasChanges && tb.filePath).map((tb) => tb.filePath as string),
  ),
  (paths) => {
    workspace.setDirtyPaths(paths);
  },
  { immediate: true, deep: true },
);

// Open the changes (diff) preview for a specific workspace file. Works for any
// open tab — uses its in-memory original vs current markdown — even if it
// isn't the active tab.
// eslint-disable-next-line @typescript-eslint/no-use-before-define
const handleWorkspaceViewChanges = (path: string) => {
  const norm = path.replace(/\\/g, '/');
  const result = findTabByFilePathSplit(path);
  const tab = result?.tab
    ?? splitState.value.panes.flatMap((p) => p.tabs).find((tb) => (tb.filePath ?? '').replace(/\\/g, '/') === norm);
  if (!tab || !tab.filePath) return;
  const original = tab.originalMarkdown ?? '';
  const current = htmlToMarkdown(tab.content || '').trimEnd();
  // No explicit names → DiffPreview falls back to its "Changes" title.
  openComparePreview(original, current);
};

// ============ Layout Config ============
const { hasStatusBarItems, hasLeftBarItems } = useLayoutConfig();

// ============ Editor Zoom ============
const { zoomIn, zoomOut, resetZoom } = useEditorZoom();

const handleWheel = (event: WheelEvent) => {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    if (event.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  }
};

// ============ Sync Active Tab Content ============
// This ensures that the active tab's content and hasChanges are up to date
// before checking for unsaved changes (e.g., when closing the window)
const syncActiveTabContent = () => {
  // In code view the SplitContainer (and its Editor) is unmounted, so
  // getEditorContent() would return the empty fallback '<p></p>' and
  // overwrite the real tab content.  Skip syncing in that case.
  if (codeView.value) return;

  // Split-editor mode also unmounts SplitContainer; the editable markdown is
  // the source of truth, so write it back as the tab's HTML content here.
  if (splitEditorActive.value) {
    if (splitSourceTabId.value !== activeTabId.value) return;
    const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (tabIndex !== -1) {
      tabs.value[tabIndex].content = markdownToHtml(splitMarkdownSource.value);
    }
    return;
  }

  const currentContent = getEditorContent();
  const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
  if (tabIndex !== -1) {
    tabs.value[tabIndex].content = currentContent;
  }
};

// ============ Close Confirmation ============
const {
  showSaveConfirmDialog,
  currentTabToSave,
  tabsToSaveCount,
  currentTabIndex,
  setupCloseHandler,
  handleSave,
  handleDiscard,
  handleCancel,
} = useCloseConfirmation({
  tabs,
  activeTabId,
  getEditorHtml: getEditorContent,
  switchToTab,
  syncActiveTabContent,
});

// ============ Auto-save ============
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

// Save a specific tab from any pane
const saveTabFromPane = async (paneId: string, tabId: string) => {
  const pane = splitState.value.panes.find(p => p.id === paneId);
  const tab = pane?.tabs.find(t => t.id === tabId);
  if (!tab?.filePath || !tab?.hasChanges) return;

  try {
    // For active tab in active pane, get fresh content from editor; for others, use stored content
    const isActiveTab = tabId === activeTabId.value && paneId === activePaneId.value;
    const html = isActiveTab ? getEditorContent() : tab.content;
    let markdown = htmlToMarkdown(html).trimEnd();

    // Preserve original line endings
    if (tab.originalMarkdown) {
      const originalLineEnding = detectLineEnding(tab.originalMarkdown);
      markdown = applyLineEnding(markdown, originalLineEnding);
      markdown = markdown.trimEnd();
    }

    markSaveStart(tab.filePath);
    await writeTextFile(tab.filePath, markdown);
    markSaveEnd(tab.filePath, markdown);

    // Update tab state
    tab.hasChanges = false;
    tab.content = html;
    tab.originalMarkdown = markdown;
  } catch (error) {
    console.error('Błąd automatycznego zapisywania:', error);
  }
};

// Save all tabs with unsaved changes across all panes
const autoSaveAllTabs = async () => {
  if (!settings.value.autoSave) return;

  // Sync active tab content first
  syncActiveTabContent();

  // Find all tabs with unsaved changes across all panes
  const unsavedTabs = getAllUnsavedTabs();

  for (const { paneId, tab } of unsavedTabs) {
    await saveTabFromPane(paneId, tab.id);
  }
};

const triggerAutoSave = () => {
  if (!settings.value.autoSave) return;

  // Check if any tab has unsaved changes across all panes
  const unsavedTabs = getAllUnsavedTabs();
  if (unsavedTabs.length === 0) return;

  // Clear existing timer
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  // Set new timer - save after 5 seconds of inactivity
  autoSaveTimer = setTimeout(() => {
    autoSaveAllTabs();
  }, 5000);
};

// Handle changes updated from SplitContainer
const handleChangesUpdated = (_paneId: string, _tabId: string, hasChanges: boolean) => {
  if (hasChanges) {
    triggerAutoSave();
  }
};

// Watch for autosave setting changes - if turned on with unsaved changes, trigger save
watch(() => settings.value.autoSave, (newValue) => {
  if (newValue) {
    const unsavedTabs = getAllUnsavedTabs();
    if (unsavedTabs.length > 0) {
      triggerAutoSave();
    }
  }
});

// ============ Keyboard Shortcuts ============
const switchTabByOffset = (offset: number) => {
  const pane = splitState.value.panes.find(p => p.id === activePaneId.value);
  if (!pane || pane.tabs.length === 0) return;
  const currentIdx = pane.tabs.findIndex(t => t.id === pane.activeTabId);
  const base = currentIdx === -1 ? 0 : currentIdx;
  const nextIdx = (base + offset + pane.tabs.length) % pane.tabs.length;
  switchTab(pane.id, pane.tabs[nextIdx].id);
};

const switchTabByIndex = (index: number) => {
  const pane = splitState.value.panes.find(p => p.id === activePaneId.value);
  if (!pane || index < 0 || index >= pane.tabs.length) return;
  switchTab(pane.id, pane.tabs[index].id);
};

const handleKeyboard = (event: KeyboardEvent) => {
  const modifier = event.ctrlKey || event.metaKey;

  if (modifier) {
    const key = event.key.toLowerCase();

    if (key === 'tab') {
      event.preventDefault();
      switchTabByOffset(event.shiftKey ? -1 : 1);
      return;
    }

    if (!event.shiftKey && key >= '1' && key <= '9') {
      event.preventDefault();
      switchTabByIndex(Number(key) - 1);
      return;
    }

    switch (key) {
      case 'n':
        event.preventDefault();
        newFile();
        break;
      case 's':
        event.preventDefault();
        if (event.shiftKey) {
          saveFileAs();
        } else {
          saveFile();
        }
        break;
      case 'o':
        event.preventDefault();
        openFileWithCrossWindowDialog();
        break;
      case 'p':
        event.preventDefault();
        openPdfDialog();
        break;
      case 'd':
        if (event.shiftKey && canShowDiff.value) {
          event.preventDefault();
          toggleDiffPreview();
        }
        break;
      case 'c':
        if (event.shiftKey && canCompareTabs.value) {
          event.preventDefault();
          compareTabs();
        }
        break;
      case 't':
        if (event.shiftKey) {
          event.preventDefault();
          toggleTocPanel();
        }
        break;
      case 'r':
        event.preventDefault();
        manualReload();
        break;
      case 'e':
        // Ctrl+Shift+E opens the workspace quick switcher (palette-style).
        if (event.shiftKey) {
          event.preventDefault();
          showWorkspaceQuickSwitcher.value = true;
        }
        break;
      case 'f':
        event.preventDefault();
        openDocumentSearch();
        break;
      case 'w':
        if (activeTabId.value && activePaneId.value) {
          event.preventDefault();
          handleCloseTabRequest(activePaneId.value, activeTabId.value);
        }
        break;
      case '=':
      case '+':
        event.preventDefault();
        zoomIn();
        break;
      case '-':
        event.preventDefault();
        zoomOut();
        break;
      case '0':
        event.preventDefault();
        resetZoom();
        break;
      case ',':
        event.preventDefault();
        showSettingsModal.value = true;
        break;
      case 'v':
        if (event.shiftKey && !splitEditorActive.value) {
          event.preventDefault();
          toggleCodeView();
        }
        break;
      case '/':
        event.preventDefault();
        showShortcutsModal.value = !showShortcutsModal.value;
        break;
    }
  }
};

// ============ Lifecycle ============
let unlistenOpenFile: UnlistenFn | null = null;
let unlistenCloseRequest: (() => void) | null = null;
let unlistenTabTransfer: UnlistenFn | null = null;
let unlistenFocusFile: UnlistenFn | null = null;
let unlistenDragEnter: UnlistenFn | null = null;
let unlistenDragDrop: UnlistenFn | null = null;
let unlistenDragLeave: UnlistenFn | null = null;
let currentWindowLabel = '';

// ============ File Drag & Drop ============
const isDragOver = ref(false);

// Wrapper that checks if file is open locally or in another window first
const openFileWithCrossWindowCheck = async (filePath: string): Promise<void> => {
  try {
    // First check if file is already open locally in this window
    const localResult = findTabByFilePathSplit(filePath);
    if (localResult) {
      console.log(`[App] File already open locally, switching to tab:`, filePath);
      splitState.value.activePaneId = localResult.pane.id;
      switchTab(localResult.pane.id, localResult.tab.id);
      return;
    }

    // Check if file is open in another window
    const windowWithFile = await checkFileOpen(filePath);
    if (windowWithFile && windowWithFile !== currentWindowLabel) {
      // File is open in another window - focus that window
      console.log(`[App] File already open in window ${windowWithFile}, focusing...`);
      await focusWindowWithFile(filePath);
      return;
    }

    // File not open anywhere - open it normally
    await openFileFromPath(filePath);

    // Register the file after successful open
    if (currentWindowLabel) {
      await registerOpenFile(filePath, currentWindowLabel);
    }
  } catch (error) {
    console.error('[App] Error in cross-window file check:', error);
    // Fall back to normal open
    await openFileFromPath(filePath);
  }
};

// Open file dialog with cross-window check
const openFileWithCrossWindowDialog = async (): Promise<void> => {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Wszystkie pliki', extensions: ['*'] },
      ],
    });

    if (selected) {
      const filePath = selected as string;
      await openFileWithCrossWindowCheck(filePath);
    }
  } catch (error) {
    console.error('[App] Error opening file dialog:', error);
  }
};

onMounted(async () => {
  window.addEventListener('keydown', handleKeyboard);
  window.addEventListener('wheel', handleWheel, { passive: false });

  // Restore last opened workspace (if any). Silent on failure — composable
  // clears the persisted root so the next launch starts fresh.
  workspace.restoreLastOnStartup().catch((e) => console.error('[App] restore workspace:', e));

  // Set window title with version
  try {
    const version = await getVersion();
    await getCurrentWindow().setTitle(`MerMark Editor v${version}`);
  } catch (error) {
    console.error('[App] Error setting window title:', error);
  }

  // Get current window label for file registry
  try {
    currentWindowLabel = await getCurrentWindowLabel();
    console.log('[App] Current window label:', currentWindowLabel);
  } catch (error) {
    console.error('[App] Error getting window label:', error);
  }

  // Set up close confirmation handler
  try {
    console.log('[App] Setting up close handler...');
    unlistenCloseRequest = await setupCloseHandler();
    console.log('[App] Close handler set up successfully');
  } catch (error) {
    console.error('[App] Błąd konfiguracji obsługi zamknięcia:', error);
  }

  // Check for file path from URL query parameters (for new windows created via drag)
  const { getFilePathFromUrl } = useWindowManager();
  const urlFilePath = getFilePathFromUrl();
  let hasExplicitFile = false;

  // Register before reading pending open state so macOS open-document events
  // cannot race past the frontend during cold start.
  try {
    unlistenOpenFile = await listen<string>('open-file', (event) => {
      hasExplicitFile = true;
      openFileWithCrossWindowCheck(event.payload);
    });
  } catch (error) {
    console.error('Błąd nasłuchiwania zdarzeń:', error);
  }

  if (urlFilePath) {
    hasExplicitFile = true;
    console.log('[App] Opening file from URL:', urlFilePath);
    await nextTick();
    setTimeout(() => openFileWithCrossWindowCheck(urlFilePath), 100);
  } else {
    // Check for file path from CLI arguments (for main window / file associations)
    try {
      const filePath = await invoke<string | null>('get_open_file_path');
      if (filePath) {
        hasExplicitFile = true;
        await nextTick();
        setTimeout(() => openFileWithCrossWindowCheck(filePath), 100);
      }
    } catch (error) {
      console.error('Błąd pobierania ścieżki pliku:', error);
    }
  }

  // Restore previous session if no explicit file was provided
  if (!hasExplicitFile) {
    const session = getSavedSession();
    if (session) {
      await nextTick();
      for (const pane of session.panes) {
        for (const tab of pane.tabs) {
          try {
            await openFileWithCrossWindowCheck(tab.filePath);
          } catch {
            // File may have been deleted since last session
          }
        }
      }
    }
  }

  // Start persisting session state
  startSessionWatching();

  // Listen for tab transfer events (from other windows)
  try {
    const { onTabTransfer } = useWindowManager();
    const { isRecentlyTransferred, markAsTransferred } = useTabDrag();
    unlistenTabTransfer = await onTabTransfer((payload) => {
      console.log('[App] Received tab transfer:', payload);

      // Check debounce to prevent transfer loops
      if (isRecentlyTransferred(payload.file_path)) {
        console.log('[App] Skipping transfer - file was recently transferred:', payload.file_path);
        return;
      }

      // Mark as transferred to prevent loops
      markAsTransferred(payload.file_path);
      openFileWithCrossWindowCheck(payload.file_path);
    });
  } catch (error) {
    console.error('Błąd nasłuchiwania transferu kart:', error);
  }

  // Listen for focus-file events (when another window asks us to focus a file)
  try {
    unlistenFocusFile = await onFocusFile((filePath) => {
      console.log('[App] Received focus-file request:', filePath);
      // Find and switch to the tab with this file
      const result = findTabByFilePathSplit(filePath);
      if (result) {
        splitState.value.activePaneId = result.pane.id;
        switchTab(result.pane.id, result.tab.id);
      }
    });
  } catch (error) {
    console.error('Błąd nasłuchiwania focus-file:', error);
  }

  // Listen for file drag & drop onto the window
  try {
    unlistenDragEnter = await listen('tauri://drag-enter', () => {
      isDragOver.value = true;
    });
    unlistenDragLeave = await listen('tauri://drag-leave', () => {
      isDragOver.value = false;
    });
    unlistenDragDrop = await listen<{ paths: string[]; position: { x: number; y: number } }>(
      'tauri://drag-drop',
      async (event) => {
        isDragOver.value = false;
        const { paths, position } = event.payload;

        const mdPaths = paths.filter(p => p.toLowerCase().endsWith('.md'));
        for (const filePath of mdPaths) {
          await openFileWithCrossWindowCheck(filePath);
        }

        if (position) {
          await handleImageDrop(paths, position);
        }
      },
    );
  } catch (error) {
    console.error('Błąd nasłuchiwania drag-drop:', error);
  }

  // Enable change detection after editor stabilizes
  setTimeout(() => {
    isLoadingContent.value = false;
  }, 200);

  // Check for updates
  setTimeout(() => checkForUpdates(), 3000);
});

onUnmounted(async () => {
  window.removeEventListener('keydown', handleKeyboard);
  window.removeEventListener('wheel', handleWheel);
  scrollSync.detach();
  marpScrollSync.detach();
  if (marpLiveTimer) clearTimeout(marpLiveTimer);
  unwatchAll();
  if (unlistenOpenFile) {
    unlistenOpenFile();
  }
  if (unlistenCloseRequest) {
    unlistenCloseRequest();
  }
  if (unlistenTabTransfer) {
    unlistenTabTransfer();
  }
  if (unlistenFocusFile) {
    unlistenFocusFile();
  }
  if (unlistenDragEnter) {
    unlistenDragEnter();
  }
  if (unlistenDragLeave) {
    unlistenDragLeave();
  }
  if (unlistenDragDrop) {
    unlistenDragDrop();
  }

  // Unregister all files for this window
  if (currentWindowLabel) {
    try {
      await unregisterWindowFiles(currentWindowLabel);
    } catch (error) {
      console.error('[App] Error unregistering window files:', error);
    }
  }
});
</script>

<template>
  <div class="app">
    <Toolbar
      :code-view="codeView"
      :is-split-active="isSplitActive"
      :split-editor-active="splitEditorActive"
      :diff-active="showDiffPreview"
      :can-show-diff="canShowDiff"
      :can-compare-tabs="canCompareTabs"
      :toc-active="showTocPanel"
      :ai-active="aiPanelOpen"
      @new-file="newFile"
      @open-file="openFileWithCrossWindowDialog"
      @open-recent="openFileWithCrossWindowCheck"
      @open-workspace="handleOpenWorkspaceFromToolbar"
      @open-recent-workspace="handleOpenRecentWorkspaceFromToolbar"
      @save-file="saveFile"
      @save-file-as="saveFileAs"
      @export-pdf="openPdfDialog"
      @export-docx="exportDocx"
      @present-marp="openMarpDialog"
      @toggle-code-view="toggleCodeView"
      @toggle-split="toggleSplit"
      @toggle-split-editor="toggleSplitEditor"
      @toggle-diff-preview="toggleDiffPreview"
      @compare-tabs="compareTabs"
      @show-shortcuts="showShortcutsModal = true"
      @show-settings="showSettingsModal = true"
      @toggle-toc="toggleTocPanel"
      @toggle-ai="toggleAiPanel"
    />

    <!-- Marp strip: extra deck actions, only when the active doc is a Marp deck -->
    <MarpToolbar
      v-if="isMarp && !codeView && !splitEditorActive"
      :preview-active="showMarpPreview"
      @new-slide="marpNewSlide"
      @set-theme="(v) => marpUpdateFrontmatter('theme', v)"
      @set-layout="marpSetLayout"
      @insert-bg="marpInsertBg"
      @toggle-paginate="marpTogglePaginate"
      @set-size="(v) => marpUpdateFrontmatter('size', v)"
      @set-font="marpSetFont"
      @present="openMarpDialog"
      @toggle-preview="toggleMarpPreview"
    />

    <!-- Main content area with optional left bar -->
    <div class="main-area">
      <!-- Workspace Sidebar (folder browser).
           Visible whenever the sidebar toggle is on — the sidebar renders an
           empty-state CTA when no workspace is open yet. -->
      <WorkspaceSidebar
        v-if="workspace.sidebarVisible.value"
        @open-file="handleWorkspaceOpenFile"
        @open-quick-switcher="showWorkspaceQuickSwitcher = true"
        @view-changes="handleWorkspaceViewChanges"
      />

      <!-- Left Bar (configurable) -->
      <LeftBar
        v-if="hasLeftBarItems"
        :code-view="codeView"
        :is-split-active="isSplitActive"
        :diff-active="showDiffPreview"
        :can-show-diff="canShowDiff"
        :can-compare-tabs="canCompareTabs"
        :toc-active="showTocPanel"
        :ai-active="aiPanelOpen"
        @new-file="newFile"
        @open-file="openFileWithCrossWindowDialog"
        @open-recent="openFileWithCrossWindowCheck"
        @open-workspace="handleOpenWorkspaceFromToolbar"
        @open-recent-workspace="handleOpenRecentWorkspaceFromToolbar"
        @save-file="saveFile"
        @save-file-as="saveFileAs"
        @export-pdf="openPdfDialog"
        @export-docx="exportDocx"
        @present-marp="openMarpDialog"
        @toggle-code-view="toggleCodeView"
        @toggle-split="toggleSplit"
        @toggle-diff-preview="toggleDiffPreview"
        @compare-tabs="compareTabs"
        @show-shortcuts="showShortcutsModal = true"
        @show-settings="showSettingsModal = true"
        @toggle-toc="toggleTocPanel"
        @toggle-ai="toggleAiPanel"
      />

      <!-- Code + Preview split: raw markdown (left) -> live WYSIWYG render (right) -->
      <div v-if="splitEditorActive && !codeView" class="split-editor-area" :class="{ 'is-marp': isMarp }">
        <TabBar
          :tabs="tabs"
          :active-tab-id="activeTabId"
          :pane-id="activePaneId"
          @switch-tab="switchToTabFromSplitEditor"
          @close-tab="closeTabFromSplitEditor"
        />
        <div class="split-editor-panes">
          <div class="split-editor-code">
            <CodeEditor
              :model-value="splitMarkdownSource"
              @update:model-value="handleSplitMarkdownInput"
            />
          </div>
          <div class="split-editor-preview">
            <Editor
              :model-value="splitPreviewHtml"
              :file-path="activeTab?.filePath || null"
              :editable="false"
              @update:model-value="(h: string) => (splitPreviewLatestHtml = h)"
              @update:has-changes="onSplitPreviewChanged"
            />
          </div>
        </div>
      </div>

      <!-- Editor area with optional TOC sidebar -->
      <div
        v-else-if="!codeView"
        class="editor-area"
        :class="{ 'is-marp': isMarp, 'with-marp-preview': marpPreviewVisible }"
      >
        <!-- Table of Contents Panel -->
        <TableOfContents
          v-if="showTocPanel"
          @close="showTocPanel = false"
        />

        <!-- Split Container with Editor Panes -->
        <SplitContainer
          ref="splitContainerRef"
          @link-click="handleLinkClick"
          @close-tab-request="handleCloseTabRequest"
          @changes-updated="handleChangesUpdated"
          @toggle-pin="handleTabTogglePin"
          @close-others="handleTabCloseOthers"
          @close-all="handleTabCloseAll"
          @close-all-but-pinned="handleTabCloseAllButPinned"
          @close-saved="handleTabCloseSaved"
          @drop-file="handleWorkspaceDropFile"
          @open-dropped-files="handleOpenDroppedFiles"
        />

        <!-- Live Marp slide preview (scroll-synced with the editor) -->
        <MarpLivePreview
          v-if="marpPreviewVisible"
          ref="marpLivePreviewRef"
          class="marp-live-pane"
          :markdown="marpLiveMarkdown"
        />
      </div>

      <!-- Code View -->
      <template v-else>
        <div class="code-view-area">
          <TabBar
            :tabs="tabs"
            :active-tab-id="activeTabId"
            :pane-id="activePaneId"
            @switch-tab="switchToTabFromCodeView"
            @close-tab="closeTabFromCodeView"
          />
          <CodeEditor
            ref="codeEditorComponentRef"
            v-model="codeContent"
            @update:model-value="onCodeContentUpdate"
          />
        </div>
      </template>
    </div>

    <!-- Status Bar (configurable) -->
    <StatusBar
      v-if="hasStatusBarItems"
      :code-view="codeView"
      :is-split-active="isSplitActive"
      :split-editor-active="splitEditorActive"
      :diff-active="showDiffPreview"
      :can-show-diff="canShowDiff"
      :can-compare-tabs="canCompareTabs"
      :toc-active="showTocPanel"
      :ai-active="aiPanelOpen"
      @new-file="newFile"
      @open-file="openFileWithCrossWindowDialog"
      @open-recent="openFileWithCrossWindowCheck"
      @open-workspace="handleOpenWorkspaceFromToolbar"
      @open-recent-workspace="handleOpenRecentWorkspaceFromToolbar"
      @save-file="saveFile"
      @save-file-as="saveFileAs"
      @export-pdf="openPdfDialog"
      @export-docx="exportDocx"
      @present-marp="openMarpDialog"
      @toggle-code-view="toggleCodeView"
      @toggle-split="toggleSplit"
      @toggle-split-editor="toggleSplitEditor"
      @toggle-diff-preview="toggleDiffPreview"
      @compare-tabs="compareTabs"
      @show-shortcuts="showShortcutsModal = true"
      @show-settings="showSettingsModal = true"
      @toggle-toc="toggleTocPanel"
      @toggle-ai="toggleAiPanel"
    />

    <!-- PDF Export Dialog -->
    <PdfExportDialog
      v-if="showPdfDialog"
      :content-html="pdfContentHtml"
      :meta="pdfMeta"
      @close="showPdfDialog = false"
    />

    <!-- Marp Presentation Dialog -->
    <MarpPreviewDialog
      v-if="showMarpDialog"
      :markdown="marpMarkdown"
      :title="marpTitle"
      @close="showMarpDialog = false"
    />

    <!-- New file: Document vs Marp -->
    <NewFileModal
      v-if="showNewFileModal"
      @choose="createDocument"
      @close="showNewFileModal = false"
    />

    <!-- Loading Overlay -->
    <LoadingOverlay v-if="isLoadingFile" />

    <!-- External Link Dialog -->
    <ExternalLinkDialog
      v-if="showExternalLinkDialog"
      :url="pendingExternalUrl"
      @confirm="confirmExternalLink"
      @cancel="cancelExternalLink"
    />

    <!-- Update Dialog -->
    <UpdateDialog
      v-if="showUpdateDialog && updateInfo"
      :version="updateInfo.version"
      :notes="updateInfo.notes"
      :progress="updateProgress"
      :is-updating="isUpdating"
      :error="updateError"
      @close="closeUpdateDialog"
      @update="downloadAndInstallUpdate"
    />

    <!-- Save Confirmation Dialog (Window Close) -->
    <SaveConfirmDialog
      v-if="showSaveConfirmDialog && currentTabToSave"
      :file-name="currentTabToSave.tab.fileName"
      :current-index="currentTabIndex"
      :total-count="tabsToSaveCount"
      @save="handleSave"
      @discard="handleDiscard"
      @cancel="handleCancel"
    />

    <!-- Tab Close Confirmation Dialog -->
    <SaveConfirmDialog
      v-if="showTabCloseDialog && tabToClose"
      :file-name="tabToClose.fileName"
      :current-index="1"
      :total-count="1"
      @save="handleTabCloseSave"
      @discard="handleTabCloseDiscard"
      @cancel="handleTabCloseCancel"
    />

    <!-- Diff Preview Overlay -->
    <DiffPreview
      v-if="showDiffPreview"
      :lines="diffPreviewLines"
      :stats="diffStats"
      :title="diffTitle"
      @close="closeDiffPreview"
    />

    <!-- Keyboard Shortcuts Modal -->
    <KeyboardShortcutsModal
      v-if="showShortcutsModal"
      @close="showShortcutsModal = false"
    />

    <!-- Settings Modal -->
    <SettingsModal
      v-if="showSettingsModal"
      @close="showSettingsModal = false"
      @show-whats-new="showSettingsModal = false; showWhatsNewModal = true"
    />

    <!-- Workspace Quick Switcher (Ctrl+Shift+E) -->
    <WorkspaceQuickSwitcher
      v-if="showWorkspaceQuickSwitcher"
      @close="showWorkspaceQuickSwitcher = false"
      @open-file="handleWorkspaceOpenFile"
    />

    <!-- Current Document Search (Ctrl/Cmd+F) -->
    <DocumentSearchBar
      v-if="documentSearch.state.value.open"
      ref="documentSearchBarRef"
      :query="documentSearch.state.value.query"
      :active-index="documentSearch.state.value.activeIndex"
      :total="documentSearch.state.value.matches.length"
      @update:query="documentSearch.setQuery"
      @next="documentSearch.next"
      @previous="documentSearch.previous"
      @close="documentSearch.close"
    />

    <!-- AI Assistant Panel (slide-in chat) -->
    <AiPanel
      v-if="aiPanelOpen"
      :open="aiPanelOpen"
      :doc-path="aiDocPath"
      :doc-content="aiDocContent"
      :selection-range="aiSelectionRange"
      :selection-text="aiSelectionText"
      :work-dir="aiWorkDir"
      :workspace-name="aiWorkspaceName"
      :workspace-root="aiWorkspaceRoot"
      @close="aiPanelOpen = false"
      @apply-content="onAiApplyContent"
      @show-diff="onAiShowDiff"
      @link-click="handleLinkClick"
    />

    <!-- AI First-run tooltip (auto-shows once) -->
    <AiFirstRunTooltip @open-settings="showSettingsModal = true" />

    <!-- AI Tmp Recovery Modal -->
    <AiTmpRecoveryModal
      v-if="tmpRecovery"
      :tmp-path="tmpRecovery.tmpPath"
      :modified-at="tmpRecovery.modifiedAt"
      @restore="onTmpRestore"
      @discard="onTmpDiscard"
      @show-diff="onTmpShowDiff"
    />

    <!-- What's New Modal -->
    <WhatsNewModal
      v-if="showWhatsNewModal"
      @close="showWhatsNewModal = false"
      @open-changelog="handleOpenChangelog"
    />

    <!-- Changelog Modal -->
    <ChangelogModal
      v-if="showChangelogModal"
      :initial-version="changelogInitialVersion ?? undefined"
      @close="showChangelogModal = false"
    />

    <!-- Pre-Save Conflict Modal (file changed on disk since last load/save) -->
    <FileConflictModal
      v-if="showPreSaveConflictModal"
      :file-name="preSaveConflictFileName"
      :file-path="preSaveConflictFilePath"
      :diff-lines="preSaveConflictDiffLines"
      :diff-stats="preSaveConflictDiffStats"
      :keep-local-label="t.saveAnyway"
      @keep-local="handlePreSaveConflictSaveAnyway"
      @load-external="handlePreSaveConflictLoadExternal"
      @merge-apply="handlePreSaveConflictMerge"
      @close="handlePreSaveConflictCancel"
    />

    <!-- File Conflict Modal (watcher-based external change) -->
    <FileConflictModal
      v-if="showConflictModal"
      :file-name="conflictFileName"
      :file-path="conflictFilePath"
      :diff-lines="conflictDiffLines"
      :diff-stats="conflictDiffStats"
      @keep-local="handleConflictKeepLocal"
      @load-external="handleConflictLoadExternal"
      @merge-apply="handleConflictMerge"
      @close="handleConflictKeepLocal"
    />

    <!-- Toast Notification -->
    <ToastNotification
      v-if="showToast"
      :message="toastMessage"
      :type="toastType"
      @close="dismissToast"
    />

    <!-- File Drag & Drop Overlay -->
    <div v-if="isDragOver" class="drag-drop-overlay">
      <div class="drag-drop-box">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="12" y1="12" x2="12" y2="18"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        <span>{{ t.dropFilesHere }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}

.main-area {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.editor-area {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* Marp live preview: editor (left) + rendered slides (right), each ~half. */
.editor-area.with-marp-preview :deep(.split-container) {
  flex: 1 1 50%;
  min-width: 0;
}
.editor-area.with-marp-preview .marp-live-pane {
  flex: 1 1 50%;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--border-primary);
}

.code-view-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.split-editor-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.split-editor-panes {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.split-editor-code,
.split-editor-preview {
  flex: 1 1 50%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.split-editor-code {
  border-right: 1px solid var(--border-primary);
}

.split-editor-preview {
  overflow-y: auto;
  background: var(--editor-container-bg);
}

.drag-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 99998;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drag-drop-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 64px;
  border: 2px dashed var(--primary, #3b82f6);
  border-radius: 16px;
  background: var(--bg-secondary, rgba(30, 41, 59, 0.9));
  color: var(--primary, #3b82f6);
  font-size: 18px;
  font-weight: 500;
}

@media print {
  .app {
    height: auto !important;
    overflow: visible !important;
    display: block !important;
  }

  .toolbar,
  .toc-panel {
    display: none !important;
  }

  .editor-area {
    display: block !important;
  }

  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
  }

  pre, blockquote, table, .mermaid-wrapper {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
</style>
