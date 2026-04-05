<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { getVersion } from '@tauri-apps/api/app';
import { useI18n } from '../i18n';
import { useSettings, EDITOR_FONTS, CODE_FONTS } from '../composables/useSettings';
import { useSystemFonts } from '../composables/useSystemFonts';
import { useLayoutConfig, type LayoutZone } from '../composables/useLayoutConfig';
import { getItemDef } from '../data/toolbarItems';

const { t, locale, setLocale, availableLocales, localeLabels } = useI18n();
const {
  settings,
  toggleAutoSave,
  setTheme,
  setEditorFontFamily,
  setCodeFontFamily,
  setEditorLineHeight,
  setSpellcheck,
  setExpandTabs,
  toggleCodeWordWrap,
} = useSettings();

const { allFonts, monoFonts, isLoaded: fontsLoaded } = useSystemFonts();

const {
  itemsForZone,
  moveItem,
  reorderItems,
  resetToDefaults: resetLayoutDefaults,
} = useLayoutConfig();

// Separate system fonts into non-mono (for editor) and mono (for code)
const editorSystemFonts = computed(() =>
  allFonts.value.filter(f => f.type !== 'monospace')
);
const codeSystemFonts = computed(() => monoFonts.value);

type SettingsTab = 'appearance' | 'editor' | 'code' | 'general' | 'layout';
const activeTab = ref<SettingsTab>('editor');

// ============ Layout Tab - Drag & Drop ============
const layoutZones: { zone: LayoutZone; labelKey: 'topToolbar' | 'bottomStatusBar' | 'leftSidebar' | 'hiddenItems' }[] = [
  { zone: 'toolbar', labelKey: 'topToolbar' },
  { zone: 'statusbar', labelKey: 'bottomStatusBar' },
  { zone: 'leftbar', labelKey: 'leftSidebar' },
  { zone: 'hidden', labelKey: 'hiddenItems' },
];

const toolbarZoneItems = itemsForZone('toolbar');
const statusbarZoneItems = itemsForZone('statusbar');
const leftbarZoneItems = itemsForZone('leftbar');
const hiddenZoneItems = itemsForZone('hidden');

const zoneItemsMap = computed(() => ({
  toolbar: toolbarZoneItems.value,
  statusbar: statusbarZoneItems.value,
  leftbar: leftbarZoneItems.value,
  hidden: hiddenZoneItems.value,
}));

const showHidden = ref(false);

// Zone labels for move-to buttons
const zoneLabelMap: Record<LayoutZone, 'topToolbar' | 'bottomStatusBar' | 'leftSidebar' | 'hiddenItems'> = {
  toolbar: 'topToolbar',
  statusbar: 'bottomStatusBar',
  leftbar: 'leftSidebar',
  hidden: 'hiddenItems',
};
const allZoneKeys: LayoutZone[] = ['toolbar', 'statusbar', 'leftbar', 'hidden'];

function getOtherZones(currentZone: LayoutZone): LayoutZone[] {
  return allZoneKeys.filter(z => z !== currentZone);
}

function moveItemTo(itemId: string, targetZone: LayoutZone) {
  moveItem(itemId, targetZone);
}

function getItemLabel(id: string): string {
  const def = getItemDef(id);
  if (!def) return id;
  // Use the labelKey to get translated label
  const key = def.labelKey as keyof typeof t.value;
  const val = t.value[key];
  return typeof val === 'string' ? val : id;
}

// Pointer-based drag & drop (document-level listeners for reliable tracking)
const dragItemId = ref<string | null>(null);
const dragSourceZone = ref<LayoutZone | null>(null);
const dropTargetZone = ref<LayoutZone | null>(null);
const dropInsertIndex = ref<number | null>(null);
const isDragging = ref(false);

let ghostEl: HTMLElement | null = null;
let ghostOffsetX = 0;
let ghostOffsetY = 0;
let indicatorEl: HTMLElement | null = null;

// Zone element refs for hit-testing
const zoneRefs = ref<Record<string, HTMLElement | null>>({});

function setZoneRef(zone: LayoutZone, el: HTMLElement | null) {
  zoneRefs.value[zone] = el;
}

function createIndicator() {
  if (indicatorEl) return;
  indicatorEl = document.createElement('div');
  indicatorEl.className = 'layout-drop-indicator';
  indicatorEl.style.cssText = 'position:fixed;height:2px;background:var(--primary,#3b82f6);border-radius:1px;z-index:100000;pointer-events:none;display:none;';
}

function showIndicator(x: number, y: number, width: number) {
  if (!indicatorEl) createIndicator();
  indicatorEl!.style.left = `${x}px`;
  indicatorEl!.style.top = `${y - 1}px`;
  indicatorEl!.style.width = `${width}px`;
  indicatorEl!.style.display = 'block';
  if (!indicatorEl!.parentElement) document.body.appendChild(indicatorEl!);
}

function hideIndicator() {
  if (indicatorEl) indicatorEl.style.display = 'none';
}

function onPointerDown(e: PointerEvent, itemId: string, sourceZone: LayoutZone) {
  if (e.button !== 0) return;
  e.preventDefault();

  dragItemId.value = itemId;
  dragSourceZone.value = sourceZone;

  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  ghostOffsetX = e.clientX - rect.left;
  ghostOffsetY = e.clientY - rect.top;

  // Create ghost
  const ghost = target.cloneNode(true) as HTMLElement;
  ghost.classList.add('layout-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${e.clientX - ghostOffsetX}px`;
  ghost.style.top = `${e.clientY - ghostOffsetY}px`;
  document.body.appendChild(ghost);
  ghostEl = ghost;
  isDragging.value = true;

  createIndicator();

  // Use document-level listeners (no pointer capture)
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
}

function onPointerMove(ev: PointerEvent) {
  if (!isDragging.value) return;

  // Move ghost
  if (ghostEl) {
    ghostEl.style.left = `${ev.clientX - ghostOffsetX}px`;
    ghostEl.style.top = `${ev.clientY - ghostOffsetY}px`;
  }

  // Hit-test zones
  const hitZone = getZoneAtPoint(ev.clientX, ev.clientY);
  dropTargetZone.value = hitZone;

  // Show drop indicator
  if (hitZone) {
    const zoneEl = zoneRefs.value[hitZone];
    if (zoneEl) {
      const items = Array.from(zoneEl.querySelectorAll('.layout-item:not(.dragging)')) as HTMLElement[];
      const { index, y, width, x } = getDropPosition(items, zoneEl, ev.clientY);
      dropInsertIndex.value = index;
      showIndicator(x, y, width);
    }
  } else {
    dropInsertIndex.value = null;
    hideIndicator();
  }
}

function onPointerUp(ev: PointerEvent) {
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);

  if (isDragging.value && dragItemId.value && dragSourceZone.value) {
    const targetZone = getZoneAtPoint(ev.clientX, ev.clientY);

    if (targetZone) {
      const zoneEl = zoneRefs.value[targetZone];
      const allItems = Array.from(zoneEl?.querySelectorAll('.layout-item') ?? []) as HTMLElement[];
      const { index: rawDropIndex } = getDropPosition(allItems, zoneEl!, ev.clientY);

      if (targetZone !== dragSourceZone.value) {
        // Move to different zone at specific position
        const targetIds = zoneItemsMap.value[targetZone].map(i => i.id);
        const newIds = [...targetIds];
        newIds.splice(rawDropIndex, 0, dragItemId.value);
        reorderItems(targetZone, newIds);
      } else {
        // Reorder within same zone
        const currentIds = zoneItemsMap.value[targetZone].map(i => i.id);
        const fromIndex = currentIds.indexOf(dragItemId.value);
        if (fromIndex !== -1 && rawDropIndex !== fromIndex) {
          const reordered = [...currentIds];
          reordered.splice(fromIndex, 1);
          const insertAt = rawDropIndex > fromIndex ? rawDropIndex - 1 : rawDropIndex;
          reordered.splice(insertAt, 0, dragItemId.value);
          reorderItems(targetZone, reordered);
        }
      }
    }
  }

  // Cleanup
  if (ghostEl) { ghostEl.remove(); ghostEl = null; }
  hideIndicator();
  isDragging.value = false;
  dragItemId.value = null;
  dragSourceZone.value = null;
  dropTargetZone.value = null;
  dropInsertIndex.value = null;
}

function getZoneAtPoint(x: number, y: number): LayoutZone | null {
  for (const [zone, el] of Object.entries(zoneRefs.value)) {
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return zone as LayoutZone;
    }
  }
  return null;
}

function getDropPosition(items: HTMLElement[], zoneEl: HTMLElement, clientY: number): { index: number; y: number; width: number; x: number } {
  const zoneRect = zoneEl.getBoundingClientRect();

  if (items.length === 0) {
    return { index: 0, y: zoneRect.top + zoneRect.height / 2, width: zoneRect.width - 12, x: zoneRect.left + 6 };
  }

  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) {
      return { index: i, y: rect.top, width: zoneRect.width - 12, x: zoneRect.left + 6 };
    }
  }

  const lastRect = items[items.length - 1].getBoundingClientRect();
  return { index: items.length, y: lastRect.bottom + 2, width: zoneRect.width - 12, x: zoneRect.left + 6 };
}

const emit = defineEmits<{
  close: [];
  showWhatsNew: [];
}>();

const appVersion = ref('');

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  try {
    appVersion.value = await getVersion();
  } catch {
    appVersion.value = '?';
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="settings-overlay" @click.self="emit('close')">
    <div class="settings-panel">
      <div class="settings-header">
        <h3>{{ t.settings }}</h3>
        <button @click="emit('close')" class="settings-close-btn" :title="t.close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="settings-body">
        <!-- Tab Navigation -->
        <div class="settings-tabs">
          <button
            v-for="tab in (['appearance', 'editor', 'code', 'general', 'layout'] as SettingsTab[])"
            :key="tab"
            class="settings-tab"
            :class="{ active: activeTab === tab }"
            @click="activeTab = tab"
          >
            <!-- Appearance icon -->
            <svg v-if="tab === 'appearance'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
            <!-- Editor icon -->
            <svg v-else-if="tab === 'editor'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <!-- Code icon -->
            <svg v-else-if="tab === 'code'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16,18 22,12 16,6"/>
              <polyline points="8,6 2,12 8,18"/>
            </svg>
            <!-- General icon -->
            <svg v-else-if="tab === 'general'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <!-- Layout icon -->
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="9" x2="9" y2="21"/>
            </svg>
            {{ tab === 'appearance' ? t.appearance : tab === 'editor' ? t.editor : tab === 'code' ? t.code : tab === 'general' ? t.general : t.layout }}
          </button>
        </div>

        <!-- Tab Content -->
        <div class="settings-content">

          <!-- Appearance Tab -->
          <div v-if="activeTab === 'appearance'" class="settings-section">
            <div class="setting-row">
              <label class="setting-label">{{ t.darkMode }} / {{ t.lightMode }}</label>
              <div class="setting-control">
                <div class="toggle-group">
                  <button
                    class="toggle-option"
                    :class="{ active: settings.theme === 'light' }"
                    @click="setTheme('light')"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="5"/>
                      <line x1="12" y1="1" x2="12" y2="3"/>
                      <line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/>
                      <line x1="21" y1="12" x2="23" y2="12"/>
                    </svg>
                    {{ t.lightMode }}
                  </button>
                  <button
                    class="toggle-option"
                    :class="{ active: settings.theme === 'dark' }"
                    @click="setTheme('dark')"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                    {{ t.darkMode }}
                  </button>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label">{{ t.language }}</label>
              <div class="setting-control">
                <div class="toggle-group">
                  <button
                    v-for="loc in availableLocales"
                    :key="loc"
                    class="toggle-option"
                    :class="{ active: locale === loc }"
                    @click="locale !== loc && setLocale(loc)"
                  >
                    {{ localeLabels[loc] }}
                  </button>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label">{{ t.expandTabs }}</label>
              <div class="setting-control">
                <div class="toggle-group">
                  <button
                    class="toggle-option"
                    :class="{ active: !settings.expandTabs }"
                    @click="setExpandTabs(false)"
                  >
                    {{ t.off }}
                  </button>
                  <button
                    class="toggle-option"
                    :class="{ active: settings.expandTabs }"
                    @click="setExpandTabs(true)"
                  >
                    {{ t.on }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Editor Tab -->
          <div v-if="activeTab === 'editor'" class="settings-section">
            <div class="setting-row">
              <label class="setting-label">{{ t.editorFont }}</label>
              <div class="setting-control">
                <select
                  class="setting-select"
                  :value="settings.editorFontFamily"
                  @change="(e: Event) => setEditorFontFamily((e.target as HTMLSelectElement).value)"
                >
                  <optgroup label="Presets">
                    <option
                      v-for="font in EDITOR_FONTS"
                      :key="font.id"
                      :value="font.id"
                      :style="{ fontFamily: font.fontFamily }"
                    >
                      {{ font.label }}
                    </option>
                  </optgroup>
                  <optgroup v-if="fontsLoaded && editorSystemFonts.length > 0" :label="t.systemFonts">
                    <option
                      v-for="font in editorSystemFonts"
                      :key="'sys-' + font.family"
                      :value="font.family"
                      :style="{ fontFamily: font.family }"
                    >
                      {{ font.family }}
                    </option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label">{{ t.lineHeight }}</label>
              <div class="setting-control inline-control">
                <input
                  type="range"
                  min="1.0"
                  max="2.5"
                  step="0.1"
                  :value="settings.editorLineHeight"
                  @input="(e: Event) => setEditorLineHeight(Number((e.target as HTMLInputElement).value))"
                  class="setting-range"
                />
                <span class="range-value">{{ settings.editorLineHeight.toFixed(1) }}</span>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label">{{ t.spellcheck }}</label>
              <div class="setting-control">
                <div class="toggle-group">
                  <button
                    class="toggle-option"
                    :class="{ active: !settings.spellcheck }"
                    @click="setSpellcheck(false)"
                  >
                    {{ t.off }}
                  </button>
                  <button
                    class="toggle-option"
                    :class="{ active: settings.spellcheck }"
                    @click="setSpellcheck(true)"
                  >
                    {{ t.on }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Font preview -->
            <div class="font-preview" :style="{ fontFamily: `var(--editor-font-family)`, lineHeight: settings.editorLineHeight }">
              The quick brown fox jumps over the lazy dog. 0123456789
            </div>
          </div>

          <!-- Code Tab -->
          <div v-if="activeTab === 'code'" class="settings-section">
            <div class="setting-row">
              <label class="setting-label">{{ t.codeFont }}</label>
              <div class="setting-control">
                <select
                  class="setting-select"
                  :value="settings.codeFontFamily"
                  @change="(e: Event) => setCodeFontFamily((e.target as HTMLSelectElement).value)"
                >
                  <optgroup label="Presets">
                    <option
                      v-for="font in CODE_FONTS"
                      :key="font.id"
                      :value="font.id"
                      :style="{ fontFamily: font.fontFamily }"
                    >
                      {{ font.label }}
                    </option>
                  </optgroup>
                  <optgroup v-if="fontsLoaded && codeSystemFonts.length > 0" :label="t.systemFonts">
                    <option
                      v-for="font in codeSystemFonts"
                      :key="'sys-' + font.family"
                      :value="font.family"
                      :style="{ fontFamily: font.family }"
                    >
                      {{ font.family }}
                    </option>
                  </optgroup>
                  <optgroup v-if="fontsLoaded && editorSystemFonts.length > 0" :label="t.otherFonts">
                    <option
                      v-for="font in editorSystemFonts"
                      :key="'sys-other-' + font.family"
                      :value="font.family"
                      :style="{ fontFamily: font.family }"
                    >
                      {{ font.family }}
                    </option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label">{{ t.wordWrap }}</label>
              <div class="setting-control">
                <div class="toggle-group">
                  <button
                    class="toggle-option"
                    :class="{ active: !settings.codeWordWrap }"
                    @click="settings.codeWordWrap && toggleCodeWordWrap()"
                  >
                    {{ t.off }}
                  </button>
                  <button
                    class="toggle-option"
                    :class="{ active: settings.codeWordWrap }"
                    @click="!settings.codeWordWrap && toggleCodeWordWrap()"
                  >
                    {{ t.on }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Code font preview -->
            <div class="font-preview code-preview" :style="{ fontFamily: `var(--code-font-family)` }">
              <span style="color: #c678dd">const</span> <span style="color: #e06c75">greeting</span> = <span style="color: #98c379">"Hello, World!"</span>;<br>
              <span style="color: #c678dd">function</span> <span style="color: #61afef">sum</span>(a, b) { <span style="color: #c678dd">return</span> a + b; }
            </div>
          </div>

          <!-- General Tab -->
          <div v-if="activeTab === 'general'" class="settings-section">
            <div class="setting-row">
              <label class="setting-label">{{ t.autoSave }}</label>
              <div class="setting-control">
                <div class="toggle-group">
                  <button
                    class="toggle-option"
                    :class="{ active: !settings.autoSave }"
                    @click="settings.autoSave && toggleAutoSave()"
                  >
                    {{ t.off }}
                  </button>
                  <button
                    class="toggle-option"
                    :class="{ active: settings.autoSave }"
                    @click="!settings.autoSave && toggleAutoSave()"
                  >
                    {{ t.on }}
                  </button>
                </div>
              </div>
            </div>

            <div class="setting-divider"></div>

            <div class="setting-row">
              <label class="setting-label">Version</label>
              <div class="setting-control version-control">
                <span class="version-number">v{{ appVersion }}</span>
                <button class="whats-new-link" @click="emit('showWhatsNew')">
                  {{ t.whatsNew }}
                </button>
              </div>
            </div>
          </div>

          <!-- Layout Tab -->
          <div v-if="activeTab === 'layout'" class="settings-section layout-section">
            <p class="layout-description">{{ t.layoutDescription }}</p>

            <template v-for="zoneConfig in layoutZones" :key="zoneConfig.zone">
              <!-- Collapsible hidden section -->
              <div v-if="zoneConfig.zone === 'hidden'" class="layout-zone-header" @click="showHidden = !showHidden">
                <svg :class="{ rotated: showHidden }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                <span>{{ t[zoneConfig.labelKey] }}</span>
                <span class="layout-zone-count">({{ zoneItemsMap[zoneConfig.zone].length }})</span>
              </div>

              <div v-else class="layout-zone-header">
                <span>{{ t[zoneConfig.labelKey] }}</span>
                <span class="layout-zone-count">({{ zoneItemsMap[zoneConfig.zone].length }})</span>
              </div>

              <div
                v-if="zoneConfig.zone !== 'hidden' || showHidden"
                :ref="(el: any) => setZoneRef(zoneConfig.zone, el as HTMLElement)"
                class="layout-drop-zone"
                :class="{ 'drop-active': dropTargetZone === zoneConfig.zone && dragSourceZone !== zoneConfig.zone, 'zone-empty': zoneItemsMap[zoneConfig.zone].length === 0 }"
              >
                <div
                  v-for="item in zoneItemsMap[zoneConfig.zone]"
                  :key="item.id"
                  class="layout-item"
                  :class="{ dragging: dragItemId === item.id }"
                  @pointerdown="(e: PointerEvent) => onPointerDown(e, item.id, zoneConfig.zone)"
                >
                  <svg class="drag-handle" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="8" cy="6" r="2"/><circle cx="16" cy="6" r="2"/>
                    <circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>
                    <circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>
                  </svg>
                  <span class="layout-item-label">{{ getItemLabel(item.id) }}</span>
                  <span class="layout-item-spacer"></span>
                  <span class="layout-move-buttons" @pointerdown.stop>
                    <button
                      v-for="tz in getOtherZones(zoneConfig.zone)"
                      :key="tz"
                      class="layout-move-btn"
                      :title="`${t.moveTo} ${t[zoneLabelMap[tz]]}`"
                      @click="moveItemTo(item.id, tz)"
                    >
                      <!-- Arrow icons per zone type -->
                      <svg v-if="tz === 'toolbar'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="12 19 12 5"/><polyline points="5 12 12 5 19 12"/></svg>
                      <svg v-else-if="tz === 'statusbar'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="12 5 12 19"/><polyline points="19 12 12 19 5 12"/></svg>
                      <svg v-else-if="tz === 'leftbar'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="19 12 5 12"/><polyline points="12 5 5 12 12 19"/></svg>
                      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </span>
                </div>
                <div v-if="zoneItemsMap[zoneConfig.zone].length === 0" class="layout-zone-empty">
                  &mdash;
                </div>
              </div>
            </template>

            <button class="reset-layout-btn" @click="resetLayoutDefaults">
              {{ t.resetLayout }}
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.settings-panel {
  background: var(--dialog-bg);
  border-radius: 12px;
  width: 600px;
  max-width: 92%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.settings-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 600;
}

.settings-close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.settings-close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.settings-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Tabs */
.settings-tabs {
  display: flex;
  gap: 0;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.settings-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s;
}

.settings-tab:hover {
  color: var(--text-secondary);
}

.settings-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* Content */
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 20px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 36px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 140px;
}

.setting-control {
  display: flex;
  align-items: center;
  flex: 1;
  justify-content: flex-end;
}

.inline-control {
  gap: 10px;
}

/* Select */
.setting-select {
  padding: 6px 10px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-input);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  min-width: 200px;
}

.setting-select:hover {
  border-color: var(--border-secondary);
}

.setting-select:focus {
  outline: none;
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 2px var(--focus-ring-alpha);
}

/* Range slider */
.setting-range {
  flex: 1;
  max-width: 160px;
  accent-color: var(--primary);
  cursor: pointer;
}

.range-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Toggle group */
.toggle-group {
  display: flex;
  background: var(--radio-group-bg, var(--bg-tertiary));
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.toggle-option {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  transition: all 0.15s;
  white-space: nowrap;
}

.toggle-option:hover {
  color: var(--text-secondary);
}

.toggle-option.active {
  background: var(--radio-active-bg, var(--bg-primary));
  color: var(--text-primary);
  box-shadow: var(--radio-active-shadow, 0 1px 3px rgba(0,0,0,0.1));
}

/* Font preview */
.font-preview {
  margin-top: 4px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  color: var(--text-secondary);
}

.code-preview {
  background: var(--code-block-bg);
  color: var(--code-block-text);
  font-family: var(--code-font-family);
}

/* Divider */
.setting-divider {
  border-top: 1px solid var(--border-primary);
  margin: 4px 0;
}

/* Version & What's new */
.version-control {
  gap: 12px;
}

.version-number {
  font-size: 13px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.whats-new-link {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.15s;
}

.whats-new-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

/* Layout Tab */
.layout-section {
  gap: 8px !important;
}

.layout-description {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 4px 0;
}

.layout-zone-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  padding: 4px 0;
  cursor: default;
  user-select: none;
}

.layout-zone-header svg {
  transition: transform 0.15s;
  color: var(--text-muted);
}

.layout-zone-header svg.rotated {
  transform: rotate(90deg);
}

.layout-zone-header:has(svg) {
  cursor: pointer;
}

.layout-zone-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
}

.layout-drop-zone {
  min-height: 40px;
  padding: 6px;
  border: 2px dashed var(--border-primary);
  border-radius: 8px;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: all 0.2s;
}

.layout-drop-zone.drop-active {
  border-color: var(--primary);
  background: var(--focus-ring-alpha, rgba(59, 130, 246, 0.08));
  border-style: solid;
}

.layout-drop-zone.zone-empty {
  justify-content: center;
  align-items: center;
}

.layout-zone-empty {
  font-size: 12px;
  color: var(--text-faint);
  padding: 4px 8px;
}

.layout-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 12px;
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition: all 0.15s;
}

.layout-item:hover {
  border-color: var(--border-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.layout-item.dragging {
  opacity: 0.3;
}

.layout-item:active {
  cursor: grabbing;
}

/* Ghost element for pointer-based drag */
:global(.layout-ghost) {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
  opacity: 0.85;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transform: scale(1.02);
  background: var(--bg-primary, #fff);
  border: 1px solid var(--primary, #3b82f6);
  border-radius: 6px;
  padding: 4px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.drag-handle {
  color: var(--text-faint);
  flex-shrink: 0;
}

.layout-item-label {
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.layout-item-spacer {
  flex: 1;
}

.layout-move-buttons {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.layout-item:hover .layout-move-buttons {
  opacity: 1;
}

.layout-move-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.layout-move-btn:hover {
  background: var(--hover-bg);
  border-color: var(--primary);
  color: var(--primary);
}

.reset-layout-btn {
  margin-top: 8px;
  padding: 6px 16px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  align-self: flex-start;
}

.reset-layout-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}
</style>
