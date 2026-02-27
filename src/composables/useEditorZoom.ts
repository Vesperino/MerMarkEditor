import { ref, computed, watch } from 'vue';

const STORAGE_KEY = 'mermark-editor-zoom';
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;
const DEFAULT_ZOOM = 100;

function loadZoom(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const value = parseInt(saved, 10);
      if (value >= MIN_ZOOM && value <= MAX_ZOOM) return value;
    }
  } catch {
    // ignore
  }
  return DEFAULT_ZOOM;
}

const zoomPercent = ref(loadZoom());

watch(zoomPercent, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
});

export function useEditorZoom() {
  const zoomScale = computed(() => zoomPercent.value / 100);

  const zoomIn = () => {
    zoomPercent.value = Math.min(MAX_ZOOM, zoomPercent.value + ZOOM_STEP);
  };

  const zoomOut = () => {
    zoomPercent.value = Math.max(MIN_ZOOM, zoomPercent.value - ZOOM_STEP);
  };

  const resetZoom = () => {
    zoomPercent.value = DEFAULT_ZOOM;
  };

  return {
    zoomPercent,
    zoomScale,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}
