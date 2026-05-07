<script setup lang="ts">
import { NodeViewWrapper } from "@tiptap/vue-3";
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from "vue";
import mermaid from "mermaid";
import { useI18n } from "../i18n";
import { useZoomPan } from "../composables/useZoomPan";
import { useFullscreen } from "../composables/useFullscreen";
import { quickAccessTemplates } from "../data/diagramTemplates";
import DiagramTemplateModal from "./DiagramTemplateModal.vue";
import { useAiMermaidTarget } from "../composables/useAiMermaidTarget";

const { t } = useI18n();

const props = defineProps<{
  node: {
    attrs: {
      code: string;
      printScale: number;
      userWidth: number | null;
      splitRatio: number;
    };
  };
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
  selected: boolean;
}>();

// Diagram size options (percentage of container width)
const sizeOptions = [25, 50, 75, 100] as const;

// Current diagram size — full width by default. Users can dial it down via
// the floating toolbar size buttons.
const diagramSize = computed(() => props.node.attrs.printScale || 100);

const setDiagramSize = (size: number) => {
  props.updateAttributes({ printScale: size });
  // Apply size to SVG after state update
  requestAnimationFrame(() => applySvgSize());
};

// Apply size directly to SVG element
const applySvgSize = () => {
  if (!containerRef.value) return;
  const svg = containerRef.value.querySelector('svg');
  if (svg) {
    const size = diagramSize.value;
    svg.style.width = `${size}%`;
    svg.style.maxWidth = `${size}%`;
    svg.style.height = 'auto';
    svg.removeAttribute('height');
  }
};

const containerRef = ref<HTMLDivElement | null>(null);
const previewContainerRef = ref<HTMLDivElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);

/**
 * User-resized width handling.
 * - `userWidth` is null until the user drags the handle, then a px value
 *   that is persisted via node attrs and survives markdown roundtrip.
 * - Hard min/max guard against zero-width or runaway dragging.
 */
const MIN_USER_WIDTH = 240;
const MAX_USER_WIDTH = 1600;

const userWidth = computed(() => props.node.attrs.userWidth);

const wrapperStyle = computed(() => {
  if (!userWidth.value) return undefined;
  return {
    width: `${userWidth.value}px`,
    maxWidth: '100%',
  } as Record<string, string>;
});

let resizeStartX = 0;
let resizeStartW = 0;
const isResizing = ref(false);

function onResizeStart(e: PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (!wrapperRef.value) return;
  resizeStartX = e.clientX;
  resizeStartW = wrapperRef.value.getBoundingClientRect().width;
  isResizing.value = true;
  (e.target as Element).setPointerCapture?.(e.pointerId);
  document.addEventListener('pointermove', onResizeMove);
  document.addEventListener('pointerup', onResizeEnd, { once: true });
}

function onResizeMove(e: PointerEvent) {
  if (!isResizing.value) return;
  const delta = e.clientX - resizeStartX;
  const next = Math.max(MIN_USER_WIDTH, Math.min(MAX_USER_WIDTH, resizeStartW + delta));
  // Update node attrs live so the wrapper reflows immediately. The final
  // value is what gets persisted to disk on save.
  props.updateAttributes({ userWidth: Math.round(next) });
}

function onResizeEnd() {
  isResizing.value = false;
  document.removeEventListener('pointermove', onResizeMove);
}

function resetUserWidth() {
  props.updateAttributes({ userWidth: null });
}

// ===== AI assist (delegates to main panel) =====
// The legacy in-modal AI flow is replaced by a bridge into the main AI panel.
// We register a target with `useAiMermaidTarget`; the panel pins the diagram
// code, runs a multi-turn conversation with model selection, and hands back
// any returned mermaid source via `pushCandidate`. The candidate lands in
// `aiPreviewCode` and the diagram displays it (instead of the saved code)
// until the user clicks Apply / Discard / Stop.
const aiMermaid = useAiMermaidTarget();
const aiPreviewCode = ref<string | null>(null);
const aiNodeId = `mermaid-node-${
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}`;
const aiTargetActive = computed(() => aiMermaid.target.value?.id === aiNodeId);

function requestAiEdit() {
  // Make sure the editing surface is open so the user can see/refine the
  // proposed diagram alongside their own edits.
  if (!isEditing.value) {
    startEdit();
  }
  // Exit zoom/preview fullscreen (mermaid_node_attrs `isFullscreen` overlay) —
  // it overlaps the editing fullscreen and would hide both the AI panel and
  // the proposed diagram. The editing fullscreen stays.
  if (isFullscreen.value) {
    toggleFullscreen();
  }
  aiMermaid.requestEdit({
    id: aiNodeId,
    initialCode: editCode.value || props.node.attrs.code,
    pushCandidate: (code) => {
      aiPreviewCode.value = code;
    },
    cancel: () => {
      aiPreviewCode.value = null;
    },
  });
}

function applyAiPreview() {
  if (!aiPreviewCode.value) return;
  const next = aiPreviewCode.value;
  // Convert <br> back to placeholder for safe storage (mirrors saveEdit).
  const safeCode = next.replace(/<br\s*\/?>/gi, '__BR__');
  props.updateAttributes({ code: safeCode });
  editCode.value = next;
  aiPreviewCode.value = null;
  aiMermaid.clear();
}

function discardAiPreview() {
  aiPreviewCode.value = null;
}

function stopAiEdit() {
  aiPreviewCode.value = null;
  aiMermaid.clear();
}
const isEditing = ref(false);
const editCode = ref(props.node.attrs.code);
const error = ref<string | null>(null);
const previewError = ref<string | null>(null);
const showTemplateModal = ref(false);
const isDark = ref(document.documentElement.classList.contains("dark"));

// Live preview rendering (debounced)
let previewTimeout: ReturnType<typeof setTimeout> | null = null;
const previewViewportRef = ref<HTMLDivElement | null>(null);

// Separate zoom/pan for editor preview
const {
  zoomPercent: previewZoomPercent,
  transformStyle: previewTransformStyle,
  zoomIn: previewZoomIn,
  zoomOut: previewZoomOut,
  resetZoom: previewResetZoom,
  fitToView: previewFitToView,
  startPan: previewStartPan,
  doPan: previewDoPan,
  endPan: previewEndPan,
  handleWheel: previewHandleWheel,
} = useZoomPan();

const handlePreviewFitToView = () => {
  previewFitToView(previewContainerRef.value, previewViewportRef.value);
};

// Resizable split between code and preview panes. Initial value comes from
// node attrs (persisted in markdown), gets clamped on drag, and is saved
// back to attrs on drag-end so reopening the file remembers the layout.
const splitRatio = ref(props.node.attrs.splitRatio || 50);
let isDraggingSplit = false;
let splitContainerRect: DOMRect | null = null;

const splitContainerEl = ref<HTMLElement | null>(null);

const startSplitDrag = (e: MouseEvent) => {
  isDraggingSplit = true;
  const container = (e.target as HTMLElement).closest('.editor-split-fullscreen') as HTMLElement;
  splitContainerEl.value = container;
  if (container) splitContainerRect = container.getBoundingClientRect();
  document.addEventListener('mousemove', doSplitDrag);
  document.addEventListener('mouseup', endSplitDrag);
  e.preventDefault();
};

const doSplitDrag = (e: MouseEvent) => {
  if (!isDraggingSplit || !splitContainerEl.value) return;
  splitContainerRect = splitContainerEl.value.getBoundingClientRect();
  const x = e.clientX - splitContainerRect.left;
  const pct = (x / splitContainerRect.width) * 100;
  splitRatio.value = Math.min(80, Math.max(20, pct));
};

const endSplitDrag = () => {
  isDraggingSplit = false;
  splitContainerRect = null;
  document.removeEventListener('mousemove', doSplitDrag);
  document.removeEventListener('mouseup', endSplitDrag);
  // Persist the dragged ratio so reopening the doc honours the user's choice.
  const next = Math.round(splitRatio.value);
  if (next !== props.node.attrs.splitRatio) {
    props.updateAttributes({ splitRatio: next });
  }
};

const renderPreview = async () => {
  if (!previewContainerRef.value || !isEditing.value) return;

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark.value ? "dark" : "default",
    securityLevel: "loose",
  });

  try {
    previewError.value = null;
    const id = `mermaid-preview-${Date.now()}`;
    // When the AI proposed a candidate, render that instead of the user's
    // in-progress edits so they can review before clicking Apply.
    const sourceForPreview = aiPreviewCode.value ?? editCode.value;
    const codeForRender = sourceForPreview
      .replace(/__BR__/g, '<br/>')
      .replace(/\\n/g, '<br/>');
    const { svg } = await mermaid.render(id, codeForRender);
    previewContainerRef.value.innerHTML = svg;
  } catch (e: unknown) {
    previewError.value = e instanceof Error ? e.message : t.value.diagramError;
    previewContainerRef.value.innerHTML = "";
  }
};

const debouncedRenderPreview = () => {
  if (previewTimeout) clearTimeout(previewTimeout);
  previewTimeout = setTimeout(renderPreview, 400);
};

const handleEditorKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    cancelEdit();
  }
};

const handleTextareaKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const textarea = e.target as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    editCode.value = editCode.value.substring(0, start) + '  ' + editCode.value.substring(end);
    nextTick(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    });
  }
};

// Use composables
const {
  zoomPercent,
  transformStyle,
  zoomIn,
  zoomOut,
  resetZoom,
  fitToView,
  startPan: startPanBase,
  doPan,
  endPan,
  handleWheel: handleWheelBase,
} = useZoomPan();

const { isFullscreen, toggleFullscreen } = useFullscreen();

// Wrap pan/zoom handlers to check editing state
const startPan = (e: MouseEvent) => {
  if (isEditing.value) return;
  startPanBase(e);
};

const handleWheel = (e: WheelEvent) => {
  if (isEditing.value) return;
  handleWheelBase(e);
};

const handleFitToView = () => {
  fitToView(containerRef.value, viewportRef.value);
};

let darkModeObserver: MutationObserver | null = null;

const renderMermaid = async () => {
  if (!containerRef.value) return;

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark.value ? "dark" : "default",
    securityLevel: "loose",
  });

  try {
    error.value = null;
    const id = `mermaid-${Date.now()}`;
    // Convert placeholder back to <br> for mermaid rendering. When an AI
    // preview is active we render that instead so the user sees the proposed
    // change in place — the saved attr stays untouched until Apply.
    const sourceCode = aiPreviewCode.value ?? props.node.attrs.code;
    const codeForRender = sourceCode
      .replace(/__BR__/g, '<br/>')
      .replace(/\\n/g, '<br/>');
    const { svg } = await mermaid.render(id, codeForRender);
    if (!containerRef.value) return;
    containerRef.value.innerHTML = svg;
    // Apply current size to rendered SVG
    applySvgSize();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t.value.diagramError;
    if (containerRef.value) containerRef.value.innerHTML = "";
  }
};

onMounted(() => {
  renderMermaid();

  darkModeObserver = new MutationObserver(() => {
    const nowDark = document.documentElement.classList.contains("dark");
    if (nowDark !== isDark.value) {
      isDark.value = nowDark;
    }
  });
  darkModeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
});

onUnmounted(() => {
  darkModeObserver?.disconnect();
  // If this node owns the active AI target, clear it so a stale callback
  // doesn't try to write to an unmounted component.
  if (aiTargetActive.value) {
    aiMermaid.clear();
  }
});

watch(
  () => props.node.attrs.code,
  () => {
    renderMermaid();
  }
);

watch(isDark, () => {
  renderMermaid();
});

// Re-render whenever the AI preview candidate changes (or is cleared).
watch(aiPreviewCode, () => {
  renderMermaid();
});

// Watch for size changes
watch(
  () => props.node.attrs.printScale,
  () => {
    applySvgSize();
  }
);

const startEdit = () => {
  // Show <br> tags to user during editing (convert placeholder to actual syntax)
  editCode.value = props.node.attrs.code.replace(/__BR__/g, '<br/>');
  isEditing.value = true;
  // Render initial preview after DOM updates
  nextTick(() => renderPreview());
};

const saveEdit = () => {
  // Convert <br> tags back to placeholder for safe storage
  const safeCode = editCode.value.replace(/<br\s*\/?>/gi, '__BR__');
  props.updateAttributes({ code: safeCode });
  isEditing.value = false;
};

const cancelEdit = () => {
  // Reset to original code (with <br> tags for display)
  editCode.value = props.node.attrs.code.replace(/__BR__/g, '<br/>');
  isEditing.value = false;
};

const insertTemplate = (code: string) => {
  editCode.value = code;
};

const handleTemplateSelect = (code: string) => {
  insertTemplate(code);
};

// Live preview: re-render on code changes while editing
watch(editCode, () => {
  if (isEditing.value) {
    debouncedRenderPreview();
  }
});

// Re-render the in-edit preview pane whenever the AI proposes (or revokes) a
// candidate so the user sees the proposal immediately while still editing.
watch(aiPreviewCode, () => {
  if (isEditing.value) {
    debouncedRenderPreview();
  }
});
</script>

<template>
  <NodeViewWrapper
    ref="wrapperRef"
    class="mermaid-wrapper"
    :class="{ selected: props.selected, resizing: isResizing, 'has-user-width': !!userWidth }"
    :data-code="encodeURIComponent(props.node.attrs.code)"
    :style="wrapperStyle"
  >
    <!-- Compact floating toolbar — appears on hover or when selected.
         Replaces the previous full-width header + standalone zoom row that
         dwarfed the diagram itself. -->
    <div class="mermaid-toolbar" v-if="!isEditing">
      <!-- Compact button row for the four print scales. The previous native
           <select> rendered weirdly inside the floating toolbar (Chromium's
           dropdown stole the popup layer and the active option visually
           shifted between renders), so it's now four buttons that activate
           by class. -->
      <span class="mermaid-toolbar-sizes" :title="t.diagramSize || 'Size'">
        <button
          v-for="size in sizeOptions"
          :key="size"
          class="mermaid-toolbar-size-btn"
          :class="{ active: diagramSize === size }"
          @click="setDiagramSize(size)"
        >{{ size }}</button>
      </span>

      <span class="mermaid-toolbar-divider"></span>

      <button class="mermaid-toolbar-btn" :title="`${t.zoomOut} (-)`" @click="zoomOut">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <span class="mermaid-toolbar-zoom" :title="t.zoom">{{ zoomPercent }}%</span>
      <button class="mermaid-toolbar-btn" :title="`${t.zoomIn} (+)`" @click="zoomIn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="mermaid-toolbar-btn" :title="`${t.reset} (100%)`" @click="resetZoom">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
      </button>
      <button class="mermaid-toolbar-btn" :title="t.fit" @click="handleFitToView">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 4 20 10 20"/><polyline points="20 10 20 4 14 4"/><line x1="4" y1="20" x2="11" y2="13"/><line x1="20" y1="4" x2="13" y2="11"/></svg>
      </button>

      <span class="mermaid-toolbar-divider"></span>

      <button class="mermaid-toolbar-btn" :title="t.editDiagram" @click="startEdit">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button
        class="mermaid-toolbar-btn"
        :class="{ active: aiTargetActive }"
        :title="t.aiAssistMermaidTitle"
        @click="requestAiEdit"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L9 8l-7 1 5 5-1 7 6-3 6 3-1-7 5-5-7-1z"/></svg>
      </button>
      <button class="mermaid-toolbar-btn" :title="`${t.fullscreen} (Esc)`" @click="toggleFullscreen">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
      </button>
      <button class="mermaid-toolbar-btn danger" :title="t.deleteDiagram" @click="props.deleteNode">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      </button>
    </div>

    <!-- Fullscreen editor overlay -->
    <Teleport to="body">
      <div
        v-if="isEditing"
        class="editor-fullscreen"
        :class="{ 'editor-fullscreen--with-ai': aiTargetActive }"
        @keydown="handleEditorKeydown"
      >
        <!-- Template modal (inside fullscreen so it renders on top) -->
        <DiagramTemplateModal
          :show="showTemplateModal"
          @close="showTemplateModal = false"
          @select="handleTemplateSelect"
        />
        <!-- Top bar -->
        <div class="editor-topbar">
          <span class="editor-topbar-title">Mermaid Editor</span>
          <div class="editor-topbar-templates">
            <button
              v-for="tmpl in quickAccessTemplates"
              :key="tmpl.name"
              @click="insertTemplate(tmpl.code)"
              class="btn-template"
            >
              {{ tmpl.name }}
            </button>
            <button @click="showTemplateModal = true" class="btn-more-templates">
              {{ t.moreTemplates }}
            </button>
          </div>
          <div class="editor-topbar-actions">
            <button
              class="btn-ai-toggle"
              :class="{ active: aiTargetActive }"
              :title="t.aiAssistMermaidTitle"
              @click="requestAiEdit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L9 8l-7 1 5 5-1 7 6-3 6 3-1-7 5-5-7-1z"/>
              </svg>
              {{ t.aiAssistMermaidButton }}
            </button>
            <button @click="saveEdit" class="btn-save">{{ t.saveDiagram }}</button>
            <button @click="cancelEdit" class="btn-cancel">{{ t.cancelEdit }}</button>
          </div>
        </div>
        <!-- Split: code left, preview right -->
        <div class="editor-split-fullscreen">
          <div class="editor-code-pane" :style="{ flex: `0 0 ${splitRatio}%` }">
            <textarea
              id="mermaid-editor-textarea"
              v-model="editCode"
              class="mermaid-textarea"
              :placeholder="t.enterMermaidCode"
              @keydown="handleTextareaKeydown"
            ></textarea>
          </div>
          <div class="split-divider-mermaid" @mousedown="startSplitDrag">
            <div class="divider-handle-mermaid"></div>
          </div>
          <div class="editor-preview-pane" :style="{ flex: `0 0 ${100 - splitRatio}%` }">
            <div v-if="aiPreviewCode !== null" class="editor-preview-ai-banner">
              <span class="editor-preview-ai-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2L9 8l-7 1 5 5-1 7 6-3 6 3-1-7 5-5-7-1z"/>
                </svg>
              </span>
              <span class="editor-preview-ai-label">{{ t.aiAssistMermaidProposed }}</span>
              <button class="editor-preview-ai-apply" @click="applyAiPreview">{{ t.aiAssistMermaidApply }}</button>
              <button class="editor-preview-ai-discard" @click="discardAiPreview">{{ t.cancel }}</button>
              <button class="editor-preview-ai-stop" @click="stopAiEdit" :title="t.aiAssistMermaidTitle">×</button>
            </div>
            <div class="editor-preview-toolbar">
              <button @click="previewZoomOut" class="btn-zoom" :title="t.zoomOut">−</button>
              <span class="zoom-level">{{ previewZoomPercent }}%</span>
              <button @click="previewZoomIn" class="btn-zoom" :title="t.zoomIn">+</button>
              <button @click="previewResetZoom" class="btn-zoom-text">{{ t.reset }}</button>
              <button @click="handlePreviewFitToView" class="btn-zoom-text">{{ t.fit }}</button>
              <div v-if="previewError" class="preview-error-inline">{{ previewError }}</div>
            </div>
            <div
              ref="previewViewportRef"
              class="editor-preview-viewport"
              @mousedown="previewStartPan"
              @mousemove="previewDoPan"
              @mouseup="previewEndPan"
              @mouseleave="previewEndPan"
              @wheel="previewHandleWheel"
            >
              <div
                ref="previewContainerRef"
                class="editor-preview-content"
                :style="previewTransformStyle"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="error" class="mermaid-error">
      {{ error }}
    </div>

    <!-- AI preview banner — visible whenever the panel hands back a mermaid
         candidate. Apply commits it to the node, Discard drops the candidate
         (target stays so the user can iterate), Stop ends the AI session. -->
    <div v-if="aiPreviewCode !== null" class="mermaid-ai-preview-banner">
      <span class="mermaid-ai-preview-icon">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L9 8l-7 1 5 5-1 7 6-3 6 3-1-7 5-5-7-1z"/>
        </svg>
      </span>
      <span class="mermaid-ai-preview-label">{{ t.aiAssistMermaidProposed }}</span>
      <button class="mermaid-ai-preview-apply" @click="applyAiPreview">
        {{ t.aiAssistMermaidApply }}
      </button>
      <button class="mermaid-ai-preview-discard" @click="discardAiPreview">
        {{ t.cancel }}
      </button>
      <button class="mermaid-ai-preview-stop" @click="stopAiEdit" :title="t.aiAssistMermaidTitle">×</button>
    </div>

    <!-- Viewport with pan/zoom -->
    <div
      ref="viewportRef"
      class="mermaid-viewport"
      :class="{ hidden: isEditing }"
      @mousedown="startPan"
      @mousemove="doPan"
      @mouseup="endPan"
      @mouseleave="endPan"
      @wheel="handleWheel"
    >
      <div
        ref="containerRef"
        class="mermaid-content"
        :style="transformStyle"
      ></div>
    </div>

    <!-- Fullscreen overlay -->
    <Teleport to="body">
      <div v-if="isFullscreen" class="fullscreen-overlay" @click.self="toggleFullscreen">
        <div class="fullscreen-controls">
          <button @click="zoomOut" class="btn-zoom" :title="t.zoomOut">−</button>
          <span class="zoom-level">{{ zoomPercent }}%</span>
          <button @click="zoomIn" class="btn-zoom" :title="t.zoomIn">+</button>
          <button @click="resetZoom" class="btn-zoom-text">{{ t.reset }}</button>
          <button @click="handleFitToView" class="btn-zoom-text">{{ t.fit }}</button>
          <button @click="toggleFullscreen" class="btn-close-fullscreen">✕ {{ t.close }}</button>
        </div>
        <div
          class="fullscreen-viewport"
          @mousedown="startPan"
          @mousemove="doPan"
          @mouseup="endPan"
          @mouseleave="endPan"
          @wheel="handleWheel"
        >
          <div class="fullscreen-content" :style="transformStyle">
            <div v-html="containerRef?.innerHTML || ''"></div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Resize handle: pull from the right edge to widen the diagram.
         Persists into node.attrs.userWidth so reopening the file restores
         the dragged-to size. Reset button (× icon) appears when a user
         width is active so the user can revert to natural sizing. -->
    <button
      v-if="!isEditing && userWidth"
      class="mermaid-reset-width"
      :title="t.reset"
      @click="resetUserWidth"
    >×</button>
    <span
      v-if="!isEditing"
      class="mermaid-resize-handle"
      :title="t.diagramSize || 'Resize'"
      @pointerdown="onResizeStart"
    ></span>
  </NodeViewWrapper>
</template>

<style scoped>
.mermaid-wrapper {
  position: relative;
  margin: 1em 0;
  padding: 0;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-primary);
  transition: border-color 0.2s;
  overflow: hidden;
}

.mermaid-wrapper.resizing {
  user-select: none;
}

/* Resize handle: vertical bar pinned to the right edge — drag to widen.
   Hidden until hover/select so it never competes with the diagram. */
.mermaid-resize-handle {
  position: absolute;
  top: 12px;
  bottom: 12px;
  right: 0;
  width: 8px;
  cursor: col-resize;
  background: transparent;
  border-radius: 4px 0 0 4px;
  transition: background 0.15s ease;
  opacity: 0;
  z-index: 4;
}

.mermaid-wrapper:hover .mermaid-resize-handle,
.mermaid-wrapper.selected .mermaid-resize-handle,
.mermaid-wrapper.resizing .mermaid-resize-handle,
.mermaid-wrapper.has-user-width .mermaid-resize-handle {
  opacity: 1;
}

.mermaid-resize-handle:hover,
.mermaid-wrapper.resizing .mermaid-resize-handle {
  background: rgba(var(--primary-rgb, 37, 99, 235), 0.25);
}

/* Small × button to revert to natural width. Only visible when the user
   has dragged the handle. */
.mermaid-reset-width {
  position: absolute;
  bottom: 6px;
  right: 14px;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--border-secondary);
  background: var(--bg-primary);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.mermaid-wrapper:hover .mermaid-reset-width,
.mermaid-wrapper.selected .mermaid-reset-width {
  opacity: 1;
}

.mermaid-reset-width:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.mermaid-wrapper.selected {
  border-color: var(--primary);
}

/* Floating toolbar — top-right, hidden by default, fades in on hover/select.
   Keeps the diagram itself the centerpiece; controls stay reachable but
   never compete for visual space. */
.mermaid-toolbar {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 3px 5px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: var(--shadow-dropdown);
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 0.15s ease, transform 0.15s ease;
  pointer-events: none;
}

.mermaid-wrapper:hover .mermaid-toolbar,
.mermaid-wrapper.selected .mermaid-toolbar,
.mermaid-toolbar:focus-within {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.mermaid-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.mermaid-toolbar-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.mermaid-toolbar-btn.danger:hover {
  background: var(--danger-bg);
  color: var(--danger);
}

.mermaid-toolbar-divider {
  width: 1px;
  height: 14px;
  margin: 0 3px;
  background: var(--border-primary);
}

.mermaid-toolbar-sizes {
  display: inline-flex;
  align-items: center;
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 1px;
  gap: 0;
}

.mermaid-toolbar-size-btn {
  background: transparent;
  border: none;
  padding: 1px 5px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 3px;
  line-height: 1.4;
  min-width: 22px;
}

.mermaid-toolbar-size-btn:hover {
  color: var(--text-primary);
}

.mermaid-toolbar-size-btn.active {
  background: var(--bg-primary);
  color: var(--primary);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.mermaid-toolbar-zoom {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: center;
  padding: 0 2px;
}

.mermaid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-primary);
  flex-wrap: wrap;
  gap: 8px;
}

.mermaid-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.size-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.size-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.size-buttons {
  display: flex;
  gap: 2px;
}

.btn-size {
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  border: 1px solid var(--border-primary);
  transition: all 0.15s;
  font-weight: 500;
}

.btn-size:hover {
  background: var(--border-primary);
  color: var(--text-secondary);
}

.btn-size.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.mermaid-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mermaid-actions {
  display: flex;
  gap: 8px;
}

.btn-edit,
.btn-delete,
.btn-save,
.btn-cancel,
.btn-template {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-edit {
  background: var(--primary);
  color: white;
}

.btn-edit:hover {
  background: var(--primary-hover);
}

.btn-delete {
  background: var(--danger-light);
  color: white;
}

.btn-delete:hover {
  background: var(--danger);
}

.btn-save {
  background: var(--success);
  color: white;
}

.btn-save:hover {
  background: var(--success-dark);
}

.btn-cancel {
  background: var(--text-muted);
  color: white;
}

.btn-cancel:hover {
  background: var(--text-secondary);
}

/* ===== AI assist in mermaid fullscreen ===== */
.btn-ai-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border: 1px solid var(--border-secondary);
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}

.btn-ai-toggle:hover,
.btn-ai-toggle.active {
  background: rgba(var(--primary-rgb, 37, 99, 235), 0.12);
  border-color: var(--primary);
  color: var(--primary);
}

.btn-template {
  background: var(--border-primary);
  color: var(--text-secondary);
}

.btn-template:hover {
  background: var(--border-secondary);
}

/* Fullscreen Editor Overlay */
.editor-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

/* When the main AI panel is bound to this diagram, shrink the fullscreen
   editor so both can coexist instead of one overlaying the other.
   AI panel width matches AiPanel.vue (.ai-panel { width: 420px }). */
.editor-fullscreen--with-ai {
  right: 420px;
}

/* AI proposal banner inside the fullscreen preview pane. */
.editor-preview-ai-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-tertiary, #1f2937);
  border-bottom: 1px solid var(--border-primary);
  border-left: 3px solid var(--primary, #6366f1);
  font-size: 12px;
  color: var(--text-primary);
}
.editor-preview-ai-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--primary, #6366f1);
  color: #fff;
  flex-shrink: 0;
}
.editor-preview-ai-label {
  flex: 1;
  font-weight: 500;
}
.editor-preview-ai-apply,
.editor-preview-ai-discard,
.editor-preview-ai-stop {
  border: 1px solid var(--border-primary);
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.editor-preview-ai-apply {
  background: var(--primary, #6366f1);
  color: #fff;
  border-color: var(--primary, #6366f1);
  font-weight: 600;
}
.editor-preview-ai-apply:hover { filter: brightness(1.05); }
.editor-preview-ai-discard:hover,
.editor-preview-ai-stop:hover { background: var(--bg-secondary); }
.editor-preview-ai-stop {
  width: 26px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}

.editor-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.editor-topbar-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.editor-topbar-templates {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.editor-topbar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.editor-split-fullscreen {
  display: flex;
  flex: 1;
  min-height: 0;
}

.editor-code-pane {
  display: flex;
  min-width: 0;
}

.editor-code-pane .mermaid-textarea {
  flex: 1;
  width: 100%;
  border: none;
  border-radius: 0;
  resize: none;
  padding: 16px;
  font-size: 14px;
  line-height: 1.6;
}

/* Split divider — wider (12 px) and more visible than before so the drag
   affordance is obvious. The hot zone extends another 8 px beyond on each
   side via ::before so users can grab it without pixel-hunting. */
.split-divider-mermaid {
  width: 12px;
  cursor: col-resize;
  background: var(--bg-tertiary);
  border-left: 1px solid var(--border-primary);
  border-right: 1px solid var(--border-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  transition: background 0.12s ease;
}

.split-divider-mermaid::before {
  content: '';
  position: absolute;
  left: -8px;
  right: -8px;
  top: 0;
  bottom: 0;
  cursor: col-resize;
}

.split-divider-mermaid:hover,
.split-divider-mermaid:active {
  background: rgba(var(--primary-rgb, 37, 99, 235), 0.12);
}

.divider-handle-mermaid {
  width: 4px;
  height: 56px;
  border-radius: 2px;
  background: var(--text-faint);
  position: relative;
}

.divider-handle-mermaid::before,
.divider-handle-mermaid::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 2px;
  background: inherit;
}

.divider-handle-mermaid::before { top: -10px; }
.divider-handle-mermaid::after { bottom: -10px; }

.split-divider-mermaid:hover .divider-handle-mermaid,
.split-divider-mermaid:active .divider-handle-mermaid {
  background: var(--divider-handle-hover, #64748b);
}

.editor-preview-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.editor-preview-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.preview-error-inline {
  margin-left: 12px;
  font-size: 11px;
  color: var(--error-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-preview-viewport {
  flex: 1;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}

.editor-preview-viewport:active {
  cursor: grabbing;
}

.editor-preview-content {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  min-height: 100%;
  transition: transform 0.1s ease-out;
}

.editor-preview-content :deep(svg) {
  max-width: 100%;
  height: auto;
}

.btn-more-templates {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--primary);
  color: white;
  white-space: nowrap;
  transition: all 0.2s;
  border: none;
}

.btn-more-templates:hover {
  background: var(--primary-hover);
}

.mermaid-textarea {
  width: 100%;
  padding: 12px;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  resize: vertical;
  background: var(--bg-input);
  color: var(--text-primary);
}

.mermaid-textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.editor-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.mermaid-error {
  padding: 12px;
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  border-radius: 4px;
  color: var(--error-color);
  font-size: 13px;
  margin-bottom: 12px;
}

.mermaid-ai-preview-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-left: 3px solid var(--primary, #6366f1);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
}
.mermaid-ai-preview-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--primary, #6366f1);
  color: #fff;
  flex-shrink: 0;
}
.mermaid-ai-preview-label {
  flex: 1;
  font-weight: 500;
}
.mermaid-ai-preview-apply,
.mermaid-ai-preview-discard,
.mermaid-ai-preview-stop {
  border: 1px solid var(--border-primary);
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.mermaid-ai-preview-apply {
  background: var(--primary, #6366f1);
  color: #fff;
  border-color: var(--primary, #6366f1);
  font-weight: 600;
}
.mermaid-ai-preview-apply:hover { filter: brightness(1.05); }
.mermaid-ai-preview-discard:hover,
.mermaid-ai-preview-stop:hover { background: var(--bg-secondary); }
.mermaid-ai-preview-stop {
  width: 26px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}

/* Zoom Controls */
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  width: fit-content;
}

.btn-zoom {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 18px;
  font-weight: bold;
  border-radius: 4px;
  cursor: pointer;
  background: var(--bg-primary);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border: 1px solid var(--border-primary);
}

.btn-zoom:hover {
  background: var(--border-primary);
  color: var(--text-primary);
}

.btn-zoom-text {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--bg-primary);
  color: var(--text-secondary);
  transition: all 0.2s;
  border: 1px solid var(--border-primary);
}

.btn-zoom-text:hover {
  background: var(--border-primary);
  color: var(--text-primary);
}

.zoom-level {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 50px;
  text-align: center;
  padding: 0 4px;
}

/* Viewport for pan/zoom */
.mermaid-viewport {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-primary);
  user-select: none;
}

.mermaid-viewport.hidden {
  display: none;
}

.mermaid-content {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  transition: transform 0.1s ease-out;
}

.mermaid-content :deep(svg) {
  transition: width 0.2s ease, max-width 0.2s ease;
  display: block;
}

/* Dark mode: ensure edge paths and arrows are visible */
html.dark .mermaid-content :deep(svg .edgePath path),
html.dark .mermaid-content :deep(svg .flowchart-link),
html.dark .mermaid-content :deep(svg path.path) {
  stroke: #aaaaaa !important;
}

html.dark .mermaid-content :deep(svg marker path) {
  fill: #aaaaaa !important;
  stroke: none !important;
}

html.dark .mermaid-content :deep(svg line),
html.dark .mermaid-content :deep(svg .messageLine0),
html.dark .mermaid-content :deep(svg .messageLine1) {
  stroke: #aaaaaa !important;
}

.btn-fullscreen {
  background: var(--primary) !important;
  color: white !important;
  border-color: var(--primary) !important;
}

.btn-fullscreen:hover {
  background: var(--primary-hover) !important;
}

/* Fullscreen Mode */
.fullscreen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 99999;
  display: flex;
  flex-direction: column;
}

.fullscreen-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
}

.fullscreen-controls .btn-zoom {
  background: #334155;
  border-color: #475569;
  color: white;
}

.fullscreen-controls .btn-zoom:hover {
  background: #475569;
}

.fullscreen-controls .btn-zoom-text {
  background: #334155;
  border-color: #475569;
  color: white;
}

.fullscreen-controls .btn-zoom-text:hover {
  background: #475569;
}

.fullscreen-controls .zoom-level {
  color: white;
}

.btn-close-fullscreen {
  padding: 6px 16px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--danger-light);
  color: white;
  border: 1px solid var(--danger);
  margin-left: 16px;
  transition: all 0.2s;
}

.btn-close-fullscreen:hover {
  background: var(--danger);
}

.fullscreen-viewport {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.fullscreen-viewport:active {
  cursor: grabbing;
}

.fullscreen-content {
  transition: transform 0.1s ease-out;
  background: var(--bg-primary);
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.fullscreen-content :deep(svg) {
  /* Override the inline width/max-width that applySvgSize sets to render the
     diagram at 25/50/75/100 % inside the document. In fullscreen we want a
     1:1 SVG that the zoom transform can scale up cleanly without compounding
     a 4x downscale (which produced blurry output at 600 % zoom). */
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
}

/* ========== Print Styles ========== */
@media print {
  .mermaid-wrapper {
    border: none !important;
    background: white !important;
    padding: 10px 0 !important;
    margin: 15px 0 !important;
    page-break-inside: avoid;
  }

  .mermaid-header,
  .mermaid-header-right,
  .mermaid-actions,
  .mermaid-editor,
  .mermaid-error,
  .zoom-controls,
  .size-control {
    display: none !important;
  }

  .mermaid-viewport {
    overflow: visible !important;
    max-height: none !important;
    min-height: auto !important;
    border: none !important;
    background: white !important;
  }

  .mermaid-content {
    display: flex !important;
    transform: none !important;
    justify-content: center !important;
    background: white !important;
    padding: 10px 0 !important;
  }

  /* SVG root — force light background */
  .mermaid-content :deep(svg) {
    height: auto !important;
    background: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .mermaid-content :deep(svg *) {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Background rect used by Mermaid dark theme */
  .mermaid-content :deep(svg > rect),
  .mermaid-content :deep(svg > style + rect),
  .mermaid-content :deep(svg > g > rect) {
    fill: white !important;
  }

  /* Text — dark on light */
  .mermaid-content :deep(svg text),
  .mermaid-content :deep(svg .nodeLabel),
  .mermaid-content :deep(svg .edgeLabel .label),
  .mermaid-content :deep(svg .label text),
  .mermaid-content :deep(svg .legend text),
  .mermaid-content :deep(svg tspan) {
    fill: #333 !important;
    color: #333 !important;
    stroke: none !important;
  }

  /* Node shapes — light fill */
  .mermaid-content :deep(svg .node rect),
  .mermaid-content :deep(svg .node circle),
  .mermaid-content :deep(svg .node ellipse),
  .mermaid-content :deep(svg .node polygon),
  .mermaid-content :deep(svg .node path),
  .mermaid-content :deep(svg .label-container),
  .mermaid-content :deep(svg .basic.label-container) {
    fill: #f8f8f8 !important;
    stroke: #333 !important;
    stroke-width: 1px !important;
  }

  /* Edges and arrows */
  .mermaid-content :deep(svg .edgePath path),
  .mermaid-content :deep(svg .flowchart-link),
  .mermaid-content :deep(svg path.path) {
    stroke: #333 !important;
    stroke-width: 1px !important;
  }

  .mermaid-content :deep(svg marker path) {
    fill: #333 !important;
  }

  /* Edge labels */
  .mermaid-content :deep(svg .edgeLabel) {
    background-color: white !important;
  }

  .mermaid-content :deep(svg .edgeLabel rect) {
    fill: white !important;
    opacity: 1 !important;
  }

  /* Clusters / subgraphs */
  .mermaid-content :deep(svg .cluster rect) {
    fill: #f8f8f8 !important;
    stroke: #ccc !important;
  }

  /* Lines (sequence diagrams etc.) */
  .mermaid-content :deep(svg line),
  .mermaid-content :deep(svg .messageLine0),
  .mermaid-content :deep(svg .messageLine1) {
    stroke: #333 !important;
  }

  /* Sequence diagram actors */
  .mermaid-content :deep(svg .actor) {
    stroke: #333 !important;
    fill: #f8f8f8 !important;
  }

  /* Gantt chart */
  .mermaid-content :deep(svg .section0),
  .mermaid-content :deep(svg .section1) {
    fill: #f0f0f0 !important;
  }

  .mermaid-content :deep(svg .task) {
    stroke: #333 !important;
    fill: #d0e0f0 !important;
  }
}
</style>
