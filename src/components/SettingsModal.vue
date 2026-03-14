<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useI18n } from '../i18n';
import { useSettings, EDITOR_FONTS, CODE_FONTS } from '../composables/useSettings';
import { useSystemFonts } from '../composables/useSystemFonts';

const { t, locale, toggleLocale } = useI18n();
const {
  settings,
  toggleAutoSave,
  setTheme,
  setEditorFontFamily,
  setCodeFontFamily,
  setEditorFontSize,
  setCodeFontSize,
  setEditorLineHeight,
  setCodeTabSize,
  setSpellcheck,
  toggleCodeWordWrap,
} = useSettings();

const { allFonts, monoFonts, isLoaded: fontsLoaded } = useSystemFonts();

// Separate system fonts into non-mono (for editor) and mono (for code)
const editorSystemFonts = computed(() =>
  allFonts.value.filter(f => f.type !== 'monospace')
);
const codeSystemFonts = computed(() => monoFonts.value);

type SettingsTab = 'appearance' | 'editor' | 'code' | 'general';
const activeTab = ref<SettingsTab>('editor');

const emit = defineEmits<{
  close: [];
}>();

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
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
            v-for="tab in (['appearance', 'editor', 'code', 'general'] as SettingsTab[])"
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
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            {{ tab === 'appearance' ? t.appearance : tab === 'editor' ? t.editor : tab === 'code' ? t.code : t.general }}
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
                    class="toggle-option"
                    :class="{ active: locale === 'en' }"
                    @click="locale !== 'en' && toggleLocale()"
                  >
                    English
                  </button>
                  <button
                    class="toggle-option"
                    :class="{ active: locale === 'pl' }"
                    @click="locale !== 'pl' && toggleLocale()"
                  >
                    Polski
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
                  <optgroup v-if="fontsLoaded && editorSystemFonts.length > 0" :label="locale === 'pl' ? 'Czcionki systemowe' : 'System Fonts'">
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
              <label class="setting-label">{{ t.editorFontSize }}</label>
              <div class="setting-control inline-control">
                <input
                  type="range"
                  min="10"
                  max="28"
                  step="1"
                  :value="settings.editorFontSize"
                  @input="(e: Event) => setEditorFontSize(Number((e.target as HTMLInputElement).value))"
                  class="setting-range"
                />
                <span class="range-value">{{ settings.editorFontSize }}px</span>
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
            <div class="font-preview" :style="{ fontFamily: `var(--editor-font-family)`, fontSize: settings.editorFontSize + 'px', lineHeight: settings.editorLineHeight }">
              The quick brown fox jumps over the lazy dog.<br>
              Zażółć gęślą jaźń. 0123456789
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
                  <optgroup v-if="fontsLoaded && codeSystemFonts.length > 0" :label="locale === 'pl' ? 'Czcionki systemowe' : 'System Fonts'">
                    <option
                      v-for="font in codeSystemFonts"
                      :key="'sys-' + font.family"
                      :value="font.family"
                      :style="{ fontFamily: font.family }"
                    >
                      {{ font.family }}
                    </option>
                  </optgroup>
                  <optgroup v-if="fontsLoaded && editorSystemFonts.length > 0" :label="locale === 'pl' ? 'Inne czcionki' : 'Other Fonts'">
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
              <label class="setting-label">{{ t.codeFontSize }}</label>
              <div class="setting-control inline-control">
                <input
                  type="range"
                  min="10"
                  max="28"
                  step="1"
                  :value="settings.codeFontSize"
                  @input="(e: Event) => setCodeFontSize(Number((e.target as HTMLInputElement).value))"
                  class="setting-range"
                />
                <span class="range-value">{{ settings.codeFontSize }}px</span>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label">{{ t.tabSize }}</label>
              <div class="setting-control">
                <div class="toggle-group">
                  <button
                    v-for="size in [2, 4, 8]"
                    :key="size"
                    class="toggle-option"
                    :class="{ active: settings.codeTabSize === size }"
                    @click="setCodeTabSize(size)"
                  >
                    {{ size }}
                  </button>
                </div>
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
            <div class="font-preview code-preview" :style="{ fontFamily: `var(--code-font-family)`, fontSize: settings.codeFontSize + 'px', tabSize: settings.codeTabSize }">
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
  width: 560px;
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
</style>
