import { ref, computed, type Ref } from 'vue';

export interface UseZoomPanOptions {
  minScale?: number;
  maxScale?: number;
  zoomStep?: number;
}

export interface UseZoomPanReturn {
  scale: Ref<number>;
  translateX: Ref<number>;
  translateY: Ref<number>;
  isPanning: Ref<boolean>;
  zoomPercent: Ref<number>;
  transformStyle: Ref<{
    transform: string;
    transformOrigin: string;
    cursor: string;
  }>;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToView: (containerRef: HTMLElement | null, viewportRef: HTMLElement | null) => Promise<void>;
  startPan: (e: MouseEvent) => void;
  doPan: (e: MouseEvent) => void;
  endPan: () => void;
  handleWheel: (e: WheelEvent) => void;
}

export function useZoomPan(options: UseZoomPanOptions = {}): UseZoomPanReturn {
  const {
    minScale = 0.1,
    maxScale = 10,
    zoomStep = 0.25,
  } = options;

  const scale = ref(1);
  const translateX = ref(0);
  const translateY = ref(0);
  const isPanning = ref(false);
  const panStart = ref({ x: 0, y: 0 });

  const transformStyle = computed(() => ({
    transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
    transformOrigin: 'center center',
    cursor: isPanning.value ? 'grabbing' : 'grab',
  }));

  const zoomPercent = computed(() => Math.round(scale.value * 100));

  const zoomIn = () => {
    scale.value = Math.min(maxScale, scale.value + zoomStep);
  };

  const zoomOut = () => {
    scale.value = Math.max(minScale, scale.value - zoomStep);
  };

  const resetZoom = () => {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  };

  const fitToView = async (containerRef: HTMLElement | null, viewportRef: HTMLElement | null) => {
    if (!containerRef || !viewportRef) return;
    const svg = containerRef.querySelector('svg');
    if (!svg) return;

    // Reset transform first to get accurate measurements
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;

    // Wait for the DOM to update
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Get SVG dimensions - try multiple methods for reliability
    let svgWidth = 0;
    let svgHeight = 0;

    // Method 1: Try viewBox attribute (most reliable for Mermaid)
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      if (parts.length >= 4) {
        svgWidth = parseFloat(parts[2]) || 0;
        svgHeight = parseFloat(parts[3]) || 0;
      }
    }

    // Method 2: Try width/height attributes
    if (!svgWidth || !svgHeight) {
      const widthAttr = svg.getAttribute('width');
      const heightAttr = svg.getAttribute('height');
      if (widthAttr && heightAttr) {
        svgWidth = parseFloat(widthAttr) || 0;
        svgHeight = parseFloat(heightAttr) || 0;
      }
    }

    // Method 3: Use getBoundingClientRect (actual rendered size)
    if (!svgWidth || !svgHeight) {
      const svgRect = svg.getBoundingClientRect();
      svgWidth = svgRect.width || svg.clientWidth || 0;
      svgHeight = svgRect.height || svg.clientHeight || 0;
    }

    // Fallback to getBBox only if other methods fail
    if (!svgWidth || !svgHeight) {
      try {
        const bbox = (svg as SVGSVGElement).getBBox();
        svgWidth = bbox.width || 100;
        svgHeight = bbox.height || 100;
      } catch {
        svgWidth = 100;
        svgHeight = 100;
      }
    }

    const viewportRect = viewportRef.getBoundingClientRect();
    const availableWidth = viewportRect.width - 40; // 20px padding on each side
    const availableHeight = viewportRect.height - 40;

    // Calculate scale to fit SVG in viewport
    const scaleX = availableWidth / svgWidth;
    const scaleY = availableHeight / svgHeight;
    const newScale = Math.min(scaleX, scaleY, 2); // Allow up to 2x for small diagrams

    scale.value = Math.max(minScale, Math.min(maxScale, newScale));
    translateX.value = 0;
    translateY.value = 0;
  };

  const startPan = (e: MouseEvent) => {
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

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
    scale.value = Math.max(minScale, Math.min(maxScale, scale.value + delta));
  };

  return {
    scale,
    translateX,
    translateY,
    isPanning,
    zoomPercent,
    transformStyle,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToView,
    startPan,
    doPan,
    endPan,
    handleWheel,
  };
}
