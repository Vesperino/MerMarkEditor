<script setup lang="ts">
import { NodeViewWrapper } from "@tiptap/vue-3";
import { ref, watch, onMounted, computed } from "vue";
import mermaid from "mermaid";
import { useI18n } from "../i18n";

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

// Zoom & Pan state
const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });
const isFullscreen = ref(false);
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_STEP = 0.25;

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
  if (isFullscreen.value) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
};

const closeFullscreen = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isFullscreen.value) {
    toggleFullscreen();
  }
};

// Add/remove keyboard listener for Escape
watch(isFullscreen, (val) => {
  if (val) {
    window.addEventListener('keydown', closeFullscreen);
  } else {
    window.removeEventListener('keydown', closeFullscreen);
  }
});

const transformStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  transformOrigin: 'center center',
  cursor: isPanning.value ? 'grabbing' : 'grab',
}));

const zoomPercent = computed(() => Math.round(scale.value * 100));

const zoomIn = () => {
  scale.value = Math.min(MAX_SCALE, scale.value + ZOOM_STEP);
};

const zoomOut = () => {
  scale.value = Math.max(MIN_SCALE, scale.value - ZOOM_STEP);
};

const resetZoom = () => {
  scale.value = 1;
  translateX.value = 0;
  translateY.value = 0;
};

const fitToView = () => {
  if (!containerRef.value || !viewportRef.value) return;
  const svg = containerRef.value.querySelector('svg');
  if (!svg) return;

  // Get natural SVG dimensions (before any transforms)
  const svgWidth = svg.getBBox().width || svg.clientWidth;
  const svgHeight = svg.getBBox().height || svg.clientHeight;
  const viewportRect = viewportRef.value.getBoundingClientRect();

  // Calculate scale to fit SVG in viewport with 10% padding
  const scaleX = (viewportRect.width * 0.9) / svgWidth;
  const scaleY = (viewportRect.height * 0.9) / svgHeight;
  const newScale = Math.min(scaleX, scaleY, 1);

  scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  translateX.value = 0;
  translateY.value = 0;
};

// Pan handlers
const startPan = (e: MouseEvent) => {
  if (isEditing.value) return;
  isPanning.value = true;
  panStart.value = { x: e.clientX - translateX.value, y: e.clientY - translateY.value };
};

const doPan = (e: MouseEvent) => {
  if (!isPanning.value) return;
  translateX.value = e.clientX - panStart.value.x;
  translateY.value = e.clientY - panStart.value.y;
};

const endPan = () => {
  isPanning.value = false;
};

// Wheel zoom
const handleWheel = (e: WheelEvent) => {
  if (isEditing.value) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
  scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta));
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

// Mermaid template categories with translation keys
const diagramCategories = computed(() => [
  {
    categoryKey: 'categoryBasic',
    templates: [
      {
        name: "Flowchart",
        code: "graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action 1]\n  B -->|No| D[Action 2]\n  C --> E[End]\n  D --> E"
      },
      {
        name: "Flowchart LR",
        code: "graph LR\n  A[Input] --> B[Process]\n  B --> C[Output]\n  B --> D[Error]\n  D --> B"
      },
      {
        name: "Sequence",
        code: "sequenceDiagram\n  participant U as User\n  participant S as System\n  participant D as Database\n  U->>S: Request\n  S->>D: Query\n  D-->>S: Result\n  S-->>U: Response"
      },
      {
        name: "Class",
        code: "classDiagram\n  class Animal {\n    +String name\n    +int age\n    +makeSound()\n  }\n  class Dog {\n    +String breed\n    +bark()\n  }\n  class Cat {\n    +meow()\n  }\n  Animal <|-- Dog\n  Animal <|-- Cat"
      },
    ]
  },
  {
    categoryKey: 'categoryStatesProcesses',
    templates: [
      {
        name: "State",
        code: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Processing : Start\n  Processing --> Success : Complete\n  Processing --> Error : Fail\n  Success --> [*]\n  Error --> Idle : Retry"
      },
      {
        name: "Gantt",
        code: "gantt\n  title Project Plan\n  dateFormat YYYY-MM-DD\n  section Phase 1\n    Task 1 :a1, 2024-01-01, 30d\n    Task 2 :after a1, 20d\n  section Phase 2\n    Task 3 :2024-02-15, 25d\n    Task 4 :2024-03-01, 15d"
      },
      {
        name: "Journey",
        code: "journey\n  title User Journey\n  section Registration\n    Visit site: 5: User\n    Fill form: 3: User\n    Confirm email: 4: User\n  section Usage\n    Login: 5: User\n    Browse: 4: User\n    Purchase: 3: User"
      },
    ]
  },
  {
    categoryKey: 'categoryDataRelations',
    templates: [
      {
        name: "ER Diagram",
        code: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE-ITEM : contains\n  PRODUCT ||--o{ LINE-ITEM : \"ordered in\"\n  CUSTOMER {\n    string name\n    string email\n  }\n  ORDER {\n    int id\n    date created\n  }"
      },
      {
        name: "Pie Chart",
        code: "pie showData\n  title Project Distribution\n  \"Development\" : 45\n  \"Testing\" : 25\n  \"Documentation\" : 15\n  \"Deployment\" : 15"
      },
      {
        name: "Mindmap",
        code: "mindmap\n  root((Project))\n    Backend\n      API\n      Database\n      Auth\n    Frontend\n      Components\n      Styles\n      State\n    DevOps\n      CI/CD\n      Monitoring"
      },
      {
        name: "Timeline",
        code: "timeline\n  title Project Timeline\n  section 2024 Q1\n    January : Planning\n    February : Development\n    March : Testing\n  section 2024 Q2\n    April : Beta release\n    May : Feedback\n    June : Production"
      },
    ]
  },
  {
    categoryKey: 'categoryGitRequirements',
    templates: [
      {
        name: "Gitgraph",
        code: "gitGraph\n  commit id: \"Initial\"\n  branch develop\n  checkout develop\n  commit id: \"Feature A\"\n  commit id: \"Feature B\"\n  checkout main\n  merge develop id: \"v1.0\"\n  commit id: \"Hotfix\"\n  branch feature\n  commit id: \"New feature\""
      },
      {
        name: "Requirement",
        code: "requirementDiagram\n  requirement user_req {\n    id: 1\n    text: User authentication\n    risk: high\n    verifymethod: test\n  }\n  element auth_module {\n    type: module\n  }\n  auth_module - satisfies -> user_req"
      },
    ]
  },
  {
    categoryKey: 'categoryC4Model',
    templates: [
      {
        name: "C4 Context",
        code: "C4Context\n  title System Context Diagram\n\n  Person(user, \"User\", \"End user of the system\")\n  System(mainSystem, \"Main System\", \"Core application\")\n  System_Ext(extSystem, \"External System\", \"Third-party service\")\n\n  Rel(user, mainSystem, \"Uses\")\n  Rel(mainSystem, extSystem, \"Calls API\")"
      },
      {
        name: "C4 Container",
        code: "C4Container\n  title Container Diagram\n\n  Person(user, \"User\", \"System user\")\n\n  System_Boundary(system, \"System\") {\n    Container(webapp, \"Web App\", \"Vue.js\", \"Frontend application\")\n    Container(api, \"API\", \"Node.js\", \"Backend API\")\n    ContainerDb(db, \"Database\", \"PostgreSQL\", \"Data storage\")\n  }\n\n  Rel(user, webapp, \"Uses\", \"HTTPS\")\n  Rel(webapp, api, \"Calls\", \"REST/JSON\")\n  Rel(api, db, \"Reads/Writes\")"
      },
      {
        name: "C4 Component",
        code: "C4Component\n  title Component Diagram\n\n  Container_Boundary(api, \"API Application\") {\n    Component(auth, \"Auth Controller\", \"TypeScript\", \"Handles authentication\")\n    Component(users, \"User Controller\", \"TypeScript\", \"User management\")\n    Component(service, \"User Service\", \"TypeScript\", \"Business logic\")\n    Component(repo, \"User Repository\", \"TypeScript\", \"Data access\")\n  }\n\n  Rel(auth, service, \"Uses\")\n  Rel(users, service, \"Uses\")\n  Rel(service, repo, \"Uses\")"
      },
      {
        name: "C4 Dynamic",
        code: "C4Dynamic\n  title Dynamic Diagram - Login Flow\n\n  Person(user, \"User\")\n  Container(spa, \"SPA\", \"Vue.js\")\n  Container(api, \"API\", \"Node.js\")\n  ContainerDb(db, \"DB\", \"PostgreSQL\")\n\n  Rel(user, spa, \"1. Enter credentials\")\n  Rel(spa, api, \"2. POST /login\")\n  Rel(api, db, \"3. Verify user\")\n  Rel(api, spa, \"4. Return JWT\")\n  Rel(spa, user, \"5. Show dashboard\")"
      },
      {
        name: "C4 Deployment",
        code: "C4Deployment\n  title Deployment Diagram\n\n  Deployment_Node(cloud, \"Cloud Provider\") {\n    Deployment_Node(k8s, \"Kubernetes Cluster\") {\n      Container(webapp, \"Web App\", \"Vue.js\")\n      Container(api, \"API\", \"Node.js\")\n    }\n    Deployment_Node(db_server, \"Database Server\") {\n      ContainerDb(db, \"Database\", \"PostgreSQL\")\n    }\n  }\n\n  Rel(webapp, api, \"Calls\")\n  Rel(api, db, \"Reads/Writes\")"
      },
    ]
  },
  {
    categoryKey: 'categoryAdvanced',
    templates: [
      {
        name: "Sankey",
        code: "sankey-beta\n\nSource A,Target X,50\nSource A,Target Y,30\nSource B,Target X,20\nSource B,Target Z,40\nTarget X,Final,70\nTarget Y,Final,30\nTarget Z,Final,40"
      },
      {
        name: "XY Chart",
        code: "xychart-beta\n  title \"Sales Data\"\n  x-axis [jan, feb, mar, apr, may, jun]\n  y-axis \"Revenue\" 0 --> 100\n  bar [20, 35, 45, 60, 55, 80]\n  line [15, 30, 40, 55, 50, 75]"
      },
      {
        name: "Block",
        code: "block-beta\n  columns 3\n  Frontend:3\n  space down1<[\" \"]>(down) space\n  Backend\n  space down2<[\" \"]>(down)\n  Database"
      },
    ]
  },
]);

// Flat list of popular templates for quick access buttons
const diagramTemplates = [
  { name: "Flowchart", code: "graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action 1]\n  B -->|No| D[Action 2]\n  C --> E[End]\n  D --> E" },
  { name: "Sequence", code: "sequenceDiagram\n  participant U as User\n  participant S as System\n  U->>S: Request\n  S-->>U: Response" },
  { name: "Class", code: "classDiagram\n  class Animal {\n    +String name\n    +makeSound()\n  }\n  class Dog\n  Animal <|-- Dog" },
  { name: "State", code: "stateDiagram-v2\n  [*] --> Active\n  Active --> Inactive\n  Inactive --> [*]" },
  { name: "ER", code: "erDiagram\n  USER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : contains" },
  { name: "Gantt", code: "gantt\n  title Plan\n  Task 1 :a1, 2024-01-01, 30d\n  Task 2 :after a1, 20d" },
  { name: "Pie", code: "pie\n  \"A\" : 40\n  \"B\" : 30\n  \"C\" : 30" },
  { name: "Mindmap", code: "mindmap\n  root((Main))\n    Topic A\n    Topic B\n    Topic C" },
];

const showTemplateModal = ref(false);

const insertTemplate = (code: string) => {
  editCode.value = code;
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
            v-for="tmpl in diagramTemplates"
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
    <div v-if="showTemplateModal" class="template-modal-overlay" @click.self="showTemplateModal = false">
      <div class="template-modal">
        <div class="modal-header">
          <h3>{{ t.mermaidDiagramTemplates }}</h3>
          <button @click="showTemplateModal = false" class="btn-close">&times;</button>
        </div>
        <div class="modal-content">
          <div v-for="cat in diagramCategories" :key="cat.categoryKey" class="template-category">
            <h4>{{ t[cat.categoryKey as keyof typeof t] }}</h4>
            <div class="category-templates">
              <button
                v-for="tmpl in cat.templates"
                :key="tmpl.name"
                @click="insertTemplate(tmpl.code); showTemplateModal = false"
                class="btn-template-large"
              >
                {{ tmpl.name }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="mermaid-error">
      {{ error }}
    </div>

    <!-- Zoom Controls -->
    <div v-if="!isEditing" class="zoom-controls">
      <button @click="zoomOut" class="btn-zoom" :title="`${t.zoomOut} (-)`">−</button>
      <span class="zoom-level">{{ zoomPercent }}%</span>
      <button @click="zoomIn" class="btn-zoom" :title="`${t.zoomIn} (+)`">+</button>
      <button @click="resetZoom" class="btn-zoom-text" :title="`${t.reset} (100%)`">{{ t.reset }}</button>
      <button @click="fitToView" class="btn-zoom-text" :title="t.fit">{{ t.fit }}</button>
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
          <button @click="fitToView" class="btn-zoom-text">{{ t.fit }}</button>
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
}

.btn-more-templates:hover {
  background: #1d4ed8;
}

/* Modal */
.template-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.template-modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
}

.btn-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.modal-content {
  padding: 20px;
  overflow-y: auto;
}

.template-category {
  margin-bottom: 24px;
}

.template-category:last-child {
  margin-bottom: 0;
}

.template-category h4 {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
}

.category-templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.btn-template-large {
  padding: 12px 16px;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  text-align: center;
  transition: all 0.2s;
}

.btn-template-large:hover {
  background: #e2e8f0;
  border-color: #cbd5e1;
  color: #1e293b;
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
/* ========== Print Styles ========== */
@media print {
  .mermaid-wrapper {
    border: none !important;
    background: white !important;
    padding: 10px 0 !important;
    margin: 15px 0 !important;
    page-break-inside: avoid;
  }

  .mermaid-header {
    display: none !important;
  }

  .mermaid-actions {
    display: none !important;
  }

  .mermaid-editor {
    display: none !important;
  }

  .mermaid-error {
    display: none !important;
  }

  .template-modal-overlay {
    display: none !important;
  }

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

  /* Preserve SVG colors during print */
  .mermaid-content :deep(svg *) {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Ensure text is visible */
  .mermaid-content :deep(svg text) {
    fill: #333 !important;
    stroke: none !important;
  }

  /* Ensure node shapes have visible strokes */
  .mermaid-content :deep(svg .node rect),
  .mermaid-content :deep(svg .node circle),
  .mermaid-content :deep(svg .node ellipse),
  .mermaid-content :deep(svg .node polygon),
  .mermaid-content :deep(svg .node path) {
    stroke: #333 !important;
    stroke-width: 1px !important;
  }

  /* Ensure edges/arrows are visible */
  .mermaid-content :deep(svg .edgePath path),
  .mermaid-content :deep(svg .flowchart-link),
  .mermaid-content :deep(svg path.path) {
    stroke: #333 !important;
    stroke-width: 1px !important;
  }

  /* Arrow markers */
  .mermaid-content :deep(svg marker path) {
    fill: #333 !important;
  }

  /* Edge labels background */
  .mermaid-content :deep(svg .edgeLabel) {
    background-color: white !important;
  }

  /* Cluster/group backgrounds */
  .mermaid-content :deep(svg .cluster rect) {
    fill: #f8f8f8 !important;
    stroke: #ccc !important;
  }

  /* Sequence diagram specific */
  .mermaid-content :deep(svg line),
  .mermaid-content :deep(svg .messageLine0),
  .mermaid-content :deep(svg .messageLine1) {
    stroke: #333 !important;
  }

  .mermaid-content :deep(svg .actor) {
    stroke: #333 !important;
    fill: #f8f8f8 !important;
  }

  /* Gantt chart specific */
  .mermaid-content :deep(svg .section0),
  .mermaid-content :deep(svg .section1) {
    fill: #f0f0f0 !important;
  }

  .mermaid-content :deep(svg .task) {
    stroke: #333 !important;
  }
}
</style>
