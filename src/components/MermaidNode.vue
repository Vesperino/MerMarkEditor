<script setup lang="ts">
import { NodeViewWrapper } from "@tiptap/vue-3";
import { ref, watch, onMounted } from "vue";
import mermaid from "mermaid";
import { useI18n } from "../i18n";
import { useZoomPan } from "../composables/useZoomPan";
import { useFullscreen } from "../composables/useFullscreen";
import { quickAccessTemplates } from "../data/diagramTemplates";
import DiagramTemplateModal from "./DiagramTemplateModal.vue";

const { t } = useI18n();

const props = defineProps<{
  node: {
    attrs: {
      code: string;
    };
  };
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
  selected: boolean;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
const isEditing = ref(false);
const editCode = ref(props.node.attrs.code);
const error = ref<string | null>(null);
const showTemplateModal = ref(false);

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

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
});

const renderMermaid = async () => {
  if (!containerRef.value) return;

  try {
    error.value = null;
    const id = `mermaid-${Date.now()}`;
    // Convert placeholder back to <br> for mermaid rendering
    const codeForRender = props.node.attrs.code.replace(/__BR__/g, '<br/>');
    const { svg } = await mermaid.render(id, codeForRender);
    containerRef.value.innerHTML = svg;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t.value.diagramError;
    containerRef.value.innerHTML = "";
  }
};

onMounted(() => {
  renderMermaid();
});

watch(
  () => props.node.attrs.code,
  () => {
    renderMermaid();
  }
);

const startEdit = () => {
  // Show <br> tags to user during editing (convert placeholder to actual syntax)
  editCode.value = props.node.attrs.code.replace(/__BR__/g, '<br/>');
  isEditing.value = true;
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
</script>

<template>
  <NodeViewWrapper class="mermaid-wrapper" :class="{ selected: props.selected }">
    <div class="mermaid-header">
      <span class="mermaid-label">Mermaid Diagram</span>
      <div class="mermaid-actions">
        <button v-if="!isEditing" @click="startEdit" class="btn-edit">{{ t.editDiagram }}</button>
        <button @click="props.deleteNode" class="btn-delete">{{ t.deleteDiagram }}</button>
      </div>
    </div>

    <div v-if="isEditing" class="mermaid-editor">
      <div class="template-row">
        <div class="template-buttons">
          <button
            v-for="tmpl in quickAccessTemplates"
            :key="tmpl.name"
            @click="insertTemplate(tmpl.code)"
            class="btn-template"
          >
            {{ tmpl.name }}
          </button>
        </div>
        <button @click="showTemplateModal = true" class="btn-more-templates">
          {{ t.moreTemplates }}
        </button>
      </div>
      <textarea
        v-model="editCode"
        class="mermaid-textarea"
        :placeholder="t.enterMermaidCode"
        rows="10"
      ></textarea>
      <div class="editor-actions">
        <button @click="saveEdit" class="btn-save">{{ t.saveDiagram }}</button>
        <button @click="cancelEdit" class="btn-cancel">{{ t.cancelEdit }}</button>
      </div>
    </div>

    <!-- Template modal -->
    <DiagramTemplateModal
      :show="showTemplateModal"
      @close="showTemplateModal = false"
      @select="handleTemplateSelect"
    />

    <div v-if="error" class="mermaid-error">
      {{ error }}
    </div>

    <!-- Zoom Controls -->
    <div v-if="!isEditing" class="zoom-controls">
      <button @click="zoomOut" class="btn-zoom" :title="`${t.zoomOut} (-)`">−</button>
      <span class="zoom-level">{{ zoomPercent }}%</span>
      <button @click="zoomIn" class="btn-zoom" :title="`${t.zoomIn} (+)`">+</button>
      <button @click="resetZoom" class="btn-zoom-text" :title="`${t.reset} (100%)`">{{ t.reset }}</button>
      <button @click="handleFitToView" class="btn-zoom-text" :title="t.fit">{{ t.fit }}</button>
      <button @click="toggleFullscreen" class="btn-zoom-text btn-fullscreen" :title="`${t.fullscreen} (Esc)`">{{ t.fullscreen }}</button>
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
  </NodeViewWrapper>
</template>

<style scoped>
.mermaid-wrapper {
  margin: 1em 0;
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
  border: 2px solid #e2e8f0;
  transition: border-color 0.2s;
}

.mermaid-wrapper.selected {
  border-color: #2563eb;
}

.mermaid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
}

.mermaid-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
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
  background: #2563eb;
  color: white;
}

.btn-edit:hover {
  background: #1d4ed8;
}

.btn-delete {
  background: #ef4444;
  color: white;
}

.btn-delete:hover {
  background: #dc2626;
}

.btn-save {
  background: #10b981;
  color: white;
}

.btn-save:hover {
  background: #059669;
}

.btn-cancel {
  background: #6b7280;
  color: white;
}

.btn-cancel:hover {
  background: #4b5563;
}

.btn-template {
  background: #e2e8f0;
  color: #475569;
}

.btn-template:hover {
  background: #cbd5e1;
}

.mermaid-editor {
  margin-bottom: 12px;
}

.template-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.template-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.btn-more-templates {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  background: #2563eb;
  color: white;
  white-space: nowrap;
  transition: all 0.2s;
  border: none;
}

.btn-more-templates:hover {
  background: #1d4ed8;
}

.mermaid-textarea {
  width: 100%;
  padding: 12px;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  resize: vertical;
  background: white;
}

.mermaid-textarea:focus {
  outline: none;
  border-color: #2563eb;
}

.editor-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.mermaid-error {
  padding: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 4px;
  color: #dc2626;
  font-size: 13px;
  margin-bottom: 12px;
}

/* Zoom Controls */
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 6px 8px;
  background: #f1f5f9;
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
  background: white;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border: 1px solid #e2e8f0;
}

.btn-zoom:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.btn-zoom-text {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  background: white;
  color: #475569;
  transition: all 0.2s;
  border: 1px solid #e2e8f0;
}

.btn-zoom-text:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.zoom-level {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  min-width: 50px;
  text-align: center;
  padding: 0 4px;
}

/* Viewport for pan/zoom */
.mermaid-viewport {
  position: relative;
  overflow: hidden;
  min-height: 200px;
  max-height: 600px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  user-select: none;
}

.mermaid-viewport.hidden {
  display: none;
}

.mermaid-content {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  padding: 20px;
  transition: transform 0.1s ease-out;
}

.mermaid-content :deep(svg) {
  max-width: none;
  height: auto;
}

.btn-fullscreen {
  background: #2563eb !important;
  color: white !important;
  border-color: #2563eb !important;
}

.btn-fullscreen:hover {
  background: #1d4ed8 !important;
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
  background: #ef4444;
  color: white;
  border: 1px solid #dc2626;
  margin-left: 16px;
  transition: all 0.2s;
}

.btn-close-fullscreen:hover {
  background: #dc2626;
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
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.fullscreen-content :deep(svg) {
  max-width: none;
  height: auto;
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
  .mermaid-actions,
  .mermaid-editor,
  .mermaid-error,
  .zoom-controls {
    display: none !important;
  }

  .mermaid-viewport {
    overflow: visible !important;
    max-height: none !important;
    border: none !important;
    background: white !important;
  }

  .mermaid-content {
    display: flex !important;
    transform: none !important;
    justify-content: center !important;
    background: white !important;
  }

  .mermaid-content :deep(svg) {
    max-width: 100% !important;
    height: auto !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .mermaid-content :deep(svg *) {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .mermaid-content :deep(svg text) {
    fill: #333 !important;
    stroke: none !important;
  }

  .mermaid-content :deep(svg .node rect),
  .mermaid-content :deep(svg .node circle),
  .mermaid-content :deep(svg .node ellipse),
  .mermaid-content :deep(svg .node polygon),
  .mermaid-content :deep(svg .node path) {
    stroke: #333 !important;
    stroke-width: 1px !important;
  }

  .mermaid-content :deep(svg .edgePath path),
  .mermaid-content :deep(svg .flowchart-link),
  .mermaid-content :deep(svg path.path) {
    stroke: #333 !important;
    stroke-width: 1px !important;
  }

  .mermaid-content :deep(svg marker path) {
    fill: #333 !important;
  }

  .mermaid-content :deep(svg .edgeLabel) {
    background-color: white !important;
  }

  .mermaid-content :deep(svg .cluster rect) {
    fill: #f8f8f8 !important;
    stroke: #ccc !important;
  }

  .mermaid-content :deep(svg line),
  .mermaid-content :deep(svg .messageLine0),
  .mermaid-content :deep(svg .messageLine1) {
    stroke: #333 !important;
  }

  .mermaid-content :deep(svg .actor) {
    stroke: #333 !important;
    fill: #f8f8f8 !important;
  }

  .mermaid-content :deep(svg .section0),
  .mermaid-content :deep(svg .section1) {
    fill: #f0f0f0 !important;
  }

  .mermaid-content :deep(svg .task) {
    stroke: #333 !important;
  }
}
</style>
