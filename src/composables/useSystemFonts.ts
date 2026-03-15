import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

export interface SystemFont {
  family: string;
  type: 'serif' | 'sans-serif' | 'monospace' | 'unknown';
}

// Well-known monospace fonts for classification
const KNOWN_MONO = new Set([
  'Consolas', 'Courier', 'Courier New', 'Fira Code', 'Fira Mono',
  'JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', 'Source Code Pro',
  'Monaco', 'Menlo', 'Lucida Console', 'Lucida Sans Typewriter',
  'PT Mono', 'Ubuntu Mono', 'Hack', 'Inconsolata', 'Droid Sans Mono',
  'DejaVu Sans Mono', 'Liberation Mono', 'Anonymous Pro', 'IBM Plex Mono',
  'Roboto Mono', 'Space Mono', 'Noto Sans Mono', 'SF Mono',
  'Input Mono', 'Fantasque Sans Mono', 'Iosevka', 'Victor Mono',
  'Rec Mono', 'Overpass Mono', 'Oxygen Mono', 'Share Tech Mono',
]);

// Well-known serif fonts
const KNOWN_SERIF = new Set([
  'Georgia', 'Times New Roman', 'Times', 'Palatino', 'Palatino Linotype',
  'Book Antiqua', 'Garamond', 'Cambria', 'Didot', 'Bodoni',
  'Rockwell', 'Baskerville', 'Libre Baskerville', 'Merriweather',
  'Noto Serif', 'PT Serif', 'Lora', 'Playfair Display', 'EB Garamond',
  'Crimson Text', 'Cormorant', 'Source Serif Pro', 'IBM Plex Serif',
  'Roboto Slab', 'Zilla Slab', 'Liberation Serif', 'DejaVu Serif',
  'Century', 'Sitka',
]);

function classifyFont(name: string): SystemFont['type'] {
  if (KNOWN_MONO.has(name)) return 'monospace';
  if (KNOWN_SERIF.has(name)) return 'serif';

  const lower = name.toLowerCase();
  if (lower.includes('mono') || lower.includes('code') || lower.includes('console') || lower.includes('typewriter')) {
    return 'monospace';
  }
  if (lower.includes('serif') && !lower.includes('sans')) {
    return 'serif';
  }

  return 'unknown';
}

// Singleton state — loaded once
const systemFonts = ref<SystemFont[]>([]);
const monoFonts = ref<SystemFont[]>([]);
const allFonts = ref<SystemFont[]>([]);
const isLoaded = ref(false);
const isLoading = ref(false);

async function loadFonts() {
  if (isLoaded.value || isLoading.value) return;
  isLoading.value = true;

  try {
    const families = await invoke<string[]>('list_system_fonts');
    const classified = families.map(family => ({
      family,
      type: classifyFont(family),
    }));

    systemFonts.value = classified;
    monoFonts.value = classified.filter(f => f.type === 'monospace');
    allFonts.value = classified;
    isLoaded.value = true;
  } catch (error) {
    console.error('Failed to load system fonts:', error);
    // Graceful fallback — leave lists empty, presets will still work
  } finally {
    isLoading.value = false;
  }
}

export function useSystemFonts() {
  // Trigger load on first use
  if (!isLoaded.value && !isLoading.value) {
    loadFonts();
  }

  return {
    systemFonts,
    monoFonts,
    allFonts,
    isLoaded,
  };
}
