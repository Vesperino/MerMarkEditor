import { ref, computed, watch } from 'vue';

const STORAGE_KEY = 'mermark-editor-zoom';
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const DEFAULT_ZOOM = 100;
// Backwards-compatibility aliases for existing imports inside this module.
const MIN_ZOOM = ZOOM_MIN;
const MAX_ZOOM = ZOOM_MAX;

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

  /** Snap-clamp an arbitrary zoom value (e.g. from a slider) into the
   *  allowed range. Non-finite inputs fall back to the current value. */
  const setZoom = (value: number) => {
    if (!Number.isFinite(value)) return;
    zoomPercent.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value)));
  };

  return {
    zoomPercent,
    zoomScale,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,
  };
}
