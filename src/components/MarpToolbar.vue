<script setup lang="ts">
import { ref } from 'vue';
import { t } from '../i18n';

defineProps<{ previewActive?: boolean }>();

const emit = defineEmits<{
  newSlide: [];
  setTheme: [value: string];
  setLayout: [value: string];
  insertBg: [opts: { source: 'local' | 'url'; pos: string }];
  togglePaginate: [];
  setSize: [value: string];
  setFont: [px: number];
  present: [];
  togglePreview: [];
}>();

const THEMES = ['gaia', 'default', 'uncover'];
const FONT_SIZES = [18, 22, 26, 32];

// Which dropdown is open (only one at a time). Empty = none.
const openMenu = ref('');
function toggle(menu: string) {
  openMenu.value = openMenu.value === menu ? '' : menu;
}
function close() {
  openMenu.value = '';
}
</script>

<template>
  <div class="marp-bar" @click.self="close">
    <span class="marp-bar-label">Marp</span>

    <button class="marp-bar-btn" v-tooltip="t.marpTipNewSlide" @click="emit('newSlide')">＋ {{ t.marpBarNewSlide }}</button>

    <!-- Theme: graphical thumbnails -->
    <div class="marp-bar-group">
      <button class="marp-bar-btn" v-tooltip="t.marpTipTheme" @click="toggle('theme')">🎨 {{ t.marpBarTheme }} ▾</button>
      <div v-if="openMenu === 'theme'" class="marp-pop">
        <div class="marp-pop-title">{{ t.marpThemeTitle }}</div>
        <div class="marp-theme-grid">
          <button
            v-for="th in THEMES"
            :key="th"
            class="marp-theme-card"
            @click="emit('setTheme', th); close()"
          >
            <span class="marp-thumb" :class="`th-${th}`">
              <span class="thumb-h"></span>
              <span class="thumb-l"></span>
              <span class="thumb-l short"></span>
            </span>
            <span class="marp-theme-name">{{ th }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Layout: labelled with descriptions -->
    <div class="marp-bar-group">
      <button class="marp-bar-btn" v-tooltip="t.marpTipLayout" @click="toggle('layout')">▦ {{ t.marpBarLayout }} ▾</button>
      <div v-if="openMenu === 'layout'" class="marp-pop">
        <div class="marp-pop-title">{{ t.marpLayoutTitle }}</div>
        <button class="marp-pop-row" @click="emit('setLayout', 'lead'); close()">
          <strong>lead</strong><span>{{ t.marpLayoutLeadDesc }}</span>
        </button>
        <button class="marp-pop-row" @click="emit('setLayout', 'invert'); close()">
          <strong>invert</strong><span>{{ t.marpLayoutInvertDesc }}</span>
        </button>
        <button class="marp-pop-row" @click="emit('setLayout', ''); close()">
          <strong>{{ t.marpBarLayoutDefault }}</strong><span>{{ t.marpLayoutDefaultDesc }}</span>
        </button>
      </div>
    </div>

    <!-- Background: position icons + source -->
    <div class="marp-bar-group">
      <button class="marp-bar-btn" v-tooltip="t.marpTipBackground" @click="toggle('bg')">🖼️ {{ t.marpBarBackground }} ▾</button>
      <div v-if="openMenu === 'bg'" class="marp-pop">
        <div class="marp-pop-title">{{ t.marpBgTitle }}</div>
        <div class="marp-bg-grid">
          <button class="marp-bg-card" @click="emit('insertBg', { source: 'local', pos: '' }); close()">
            <span class="bg-ico"><span class="bg-fill full"></span></span>
            <span>{{ t.marpBgLocalFull }}</span>
          </button>
          <button class="marp-bg-card" @click="emit('insertBg', { source: 'local', pos: 'left:50%' }); close()">
            <span class="bg-ico"><span class="bg-fill left"></span></span>
            <span>{{ t.marpBgLocalLeft }}</span>
          </button>
          <button class="marp-bg-card" @click="emit('insertBg', { source: 'local', pos: 'right:50%' }); close()">
            <span class="bg-ico"><span class="bg-fill right"></span></span>
            <span>{{ t.marpBgLocalRight }}</span>
          </button>
          <button class="marp-bg-card" @click="emit('insertBg', { source: 'url', pos: '' }); close()">
            <span class="bg-ico">🔗</span>
            <span>{{ t.marpBgUrl }}</span>
          </button>
        </div>
      </div>
    </div>

    <button class="marp-bar-btn" v-tooltip="t.marpTipPaginate" @click="emit('togglePaginate')">🔢 {{ t.marpBarPaginate }}</button>

    <div class="marp-bar-group">
      <button class="marp-bar-btn" v-tooltip="t.marpTipSize" @click="toggle('size')">📐 {{ t.marpBarSize }} ▾</button>
      <div v-if="openMenu === 'size'" class="marp-pop marp-pop--narrow">
        <button class="marp-pop-row" @click="emit('setSize', '16:9'); close()"><strong>16:9</strong></button>
        <button class="marp-pop-row" @click="emit('setSize', '4:3'); close()"><strong>4:3</strong></button>
      </div>
    </div>

    <div class="marp-bar-group">
      <button class="marp-bar-btn" v-tooltip="t.marpTipFont" @click="toggle('font')">🔤 {{ t.marpBarFont }} ▾</button>
      <div v-if="openMenu === 'font'" class="marp-pop marp-pop--narrow">
        <button v-for="px in FONT_SIZES" :key="px" class="marp-pop-row" @click="emit('setFont', px); close()">
          <strong>{{ px }} px</strong>
        </button>
        <button class="marp-pop-row" @click="emit('setFont', 0); close()"><strong>{{ t.marpFontDefault }}</strong></button>
      </div>
    </div>

    <button
      class="marp-bar-btn"
      :class="{ 'marp-bar-btn--active': previewActive }"
      v-tooltip="t.marpTipPreview"
      @click="emit('togglePreview')"
    >👁 {{ t.marpBarPreview }}</button>

    <button class="marp-bar-btn marp-bar-btn--primary" v-tooltip="t.marpTipPresent" @click="emit('present')">▶ {{ t.marpBarPresent }}</button>
  </div>
</template>

<style scoped>
.marp-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary);
  background: linear-gradient(135deg, rgba(107, 91, 210, 0.10), transparent);
  flex-wrap: wrap;
}

.marp-bar-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--primary, #6b5bd2);
  margin-right: 4px;
}

.marp-bar-group {
  position: relative;
}

.marp-bar-btn {
  padding: 4px 10px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.marp-bar-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.marp-bar-btn--active {
  border-color: var(--primary, #6b5bd2);
  color: var(--primary, #6b5bd2);
  background: rgba(107, 91, 210, 0.12);
}
.marp-bar-btn--primary {
  margin-left: auto;
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

/* Popover */
.marp-pop {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  min-width: 230px;
  padding: 8px;
  background: var(--dialog-bg, #1e1e2a);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  box-shadow: var(--shadow-dropdown);
}
.marp-pop--narrow {
  min-width: 90px;
}
.marp-pop-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  padding: 2px 4px 8px;
}
.marp-pop-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.marp-pop-row:hover {
  background: var(--hover-bg);
}
.marp-pop-row strong {
  color: var(--text-primary);
  font-family: var(--font-mono, monospace);
}
.marp-pop-row span {
  font-size: 11px;
  color: var(--text-muted);
}

/* Theme thumbnails */
.marp-theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.marp-theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.marp-theme-card:hover {
  border-color: var(--primary, #6b5bd2);
  background: var(--hover-bg);
}
.marp-thumb {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 72px;
  height: 46px;
  padding: 7px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  overflow: hidden;
}
.marp-thumb .thumb-h {
  height: 8px;
  width: 70%;
  border-radius: 2px;
}
.marp-thumb .thumb-l {
  height: 4px;
  width: 90%;
  border-radius: 2px;
  opacity: 0.55;
}
.marp-thumb .thumb-l.short {
  width: 60%;
}
.marp-theme-name {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-mono, monospace);
}
/* default: white, blue heading */
.th-default { background: #ffffff; }
.th-default .thumb-h { background: #4063d8; }
.th-default .thumb-l { background: #333; }
/* gaia: cream, maroon heading, centered */
.th-gaia { background: #fff8e7; align-items: center; }
.th-gaia .thumb-h { background: #b5532f; width: 80%; }
.th-gaia .thumb-l { background: #5b4636; }
/* uncover: light gray, bold dark, centered */
.th-uncover { background: #eef0f2; align-items: center; }
.th-uncover .thumb-h { background: #111; width: 85%; }
.th-uncover .thumb-l { background: #555; }

/* Background position icons */
.marp-bg-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.marp-bg-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.marp-bg-card:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.bg-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 20px;
  border: 1px solid var(--border-secondary, #888);
  border-radius: 3px;
  position: relative;
  overflow: hidden;
  font-size: 12px;
  flex: 0 0 auto;
}
.bg-fill {
  position: absolute;
  inset: 0;
  background: var(--primary, #6b5bd2);
  opacity: 0.6;
}
.bg-fill.left { right: 50%; }
.bg-fill.right { left: 50%; }
.bg-fill.full { inset: 0; }
</style>
