<script setup lang="ts">
import { NodeViewWrapper } from "@tiptap/vue-3";
import { ref, watch, onMounted, computed } from "vue";
import mermaid from "mermaid";

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
const isEditing = ref(false);
const editCode = ref(props.node.attrs.code);
const error = ref<string | null>(null);

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
    const { svg } = await mermaid.render(id, props.node.attrs.code);
    containerRef.value.innerHTML = svg;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Błąd renderowania diagramu";
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
  editCode.value = props.node.attrs.code;
  isEditing.value = true;
};

const saveEdit = () => {
  props.updateAttributes({ code: editCode.value });
  isEditing.value = false;
};

const cancelEdit = () => {
  editCode.value = props.node.attrs.code;
  isEditing.value = false;
};

const diagramTemplates = [
  { name: "Flowchart", code: "graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action 1]\n  B -->|No| D[Action 2]\n  C --> E[End]\n  D --> E" },
  { name: "Sequence", code: "sequenceDiagram\n  participant A as User\n  participant B as System\n  A->>B: Request\n  B-->>A: Response" },
  { name: "Class", code: "classDiagram\n  class Animal {\n    +String name\n    +makeSound()\n  }\n  class Dog {\n    +bark()\n  }\n  Animal <|-- Dog" },
  { name: "C4 Context", code: "C4Context\n  title System Context\n  Person(user, \"User\", \"A user of the system\")\n  System(system, \"System\", \"The main system\")\n  Rel(user, system, \"Uses\")" },
];

const insertTemplate = (code: string) => {
  editCode.value = code;
};
</script>

<template>
  <NodeViewWrapper class="mermaid-wrapper" :class="{ selected: props.selected }">
    <div class="mermaid-header">
      <span class="mermaid-label">Mermaid Diagram</span>
      <div class="mermaid-actions">
        <button v-if="!isEditing" @click="startEdit" class="btn-edit">Edytuj</button>
        <button @click="props.deleteNode" class="btn-delete">Usuń</button>
      </div>
    </div>

    <div v-if="isEditing" class="mermaid-editor">
      <div class="template-buttons">
        <button
          v-for="tmpl in diagramTemplates"
          :key="tmpl.name"
          @click="insertTemplate(tmpl.code)"
          class="btn-template"
        >
          {{ tmpl.name }}
        </button>
      </div>
      <textarea
        v-model="editCode"
        class="mermaid-textarea"
        placeholder="Wprowadź kod Mermaid..."
        rows="8"
      ></textarea>
      <div class="editor-actions">
        <button @click="saveEdit" class="btn-save">Zapisz</button>
        <button @click="cancelEdit" class="btn-cancel">Anuluj</button>
      </div>
    </div>

    <div v-if="error" class="mermaid-error">
      {{ error }}
    </div>

    <div ref="containerRef" class="mermaid-content" :class="{ hidden: isEditing }"></div>
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

.template-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
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

.mermaid-content {
  display: flex;
  justify-content: center;
  overflow: auto;
}

.mermaid-content.hidden {
  display: none;
}

.mermaid-content :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
