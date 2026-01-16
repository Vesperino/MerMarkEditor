import { ref, readonly } from 'vue';

export interface DraggedTab {
  tabId: string;
  paneId: string;
  fileName: string;
  filePath: string | null;
  element: HTMLElement | null;
}

export interface DropZone {
  paneId: string;
  index: number;
}

const isDragging = ref(false);
const draggedTab = ref<DraggedTab | null>(null);
const dragGhost = ref<HTMLElement | null>(null);
const currentDropZone = ref<DropZone | null>(null);
const mouseX = ref(0);
const mouseY = ref(0);

let onDropCallback: ((tabId: string, sourcePaneId: string, targetPaneId: string, targetIndex: number) => void) | null = null;
let onDropOutsideCallback: ((tabId: string, paneId: string, filePath: string | null) => void) | null = null;

function createGhostElement(tab: DraggedTab): HTMLElement {
  const ghost = document.createElement('div');
  ghost.className = 'tab-drag-ghost';
  ghost.innerHTML = `
    <span class="ghost-icon">📄</span>
    <span class="ghost-name">${tab.fileName}</span>
  `;
  ghost.style.cssText = `
    position: fixed;
    z-index: 10000;
    background: white;
    border: 2px solid #3b82f6;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    color: #1e293b;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 8px;
    transform: translate(-50%, -50%);
    opacity: 0.95;
  `;
  document.body.appendChild(ghost);
  return ghost;
}

function updateGhostPosition(x: number, y: number): void {
  if (dragGhost.value) {
    dragGhost.value.style.left = `${x}px`;
    dragGhost.value.style.top = `${y}px`;
  }
}

function removeGhost(): void {
  if (dragGhost.value) {
    dragGhost.value.remove();
    dragGhost.value = null;
  }
}

function handleMouseMove(event: MouseEvent): void {
  if (!isDragging.value) return;

  mouseX.value = event.clientX;
  mouseY.value = event.clientY;
  updateGhostPosition(event.clientX, event.clientY);
}

function handleMouseUp(event: MouseEvent): void {
  if (!isDragging.value || !draggedTab.value) {
    cleanup();
    return;
  }

  const tab = draggedTab.value;

  if (currentDropZone.value && onDropCallback) {
    onDropCallback(
      tab.tabId,
      tab.paneId,
      currentDropZone.value.paneId,
      currentDropZone.value.index
    );
  } else {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const x = event.clientX;
    const y = event.clientY;

    const isOutsideWindow = x < 0 || x > windowWidth || y < 0 || y > windowHeight;
    if (isOutsideWindow && onDropOutsideCallback) {
      onDropOutsideCallback(tab.tabId, tab.paneId, tab.filePath);
    }
  }

  cleanup();
}

function cleanup(): void {
  isDragging.value = false;
  draggedTab.value = null;
  currentDropZone.value = null;
  removeGhost();

  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

export function useTabDrag() {
  const startDrag = (tab: DraggedTab, event: MouseEvent): void => {
    if (isDragging.value) return;

    isDragging.value = true;
    draggedTab.value = tab;
    mouseX.value = event.clientX;
    mouseY.value = event.clientY;

    dragGhost.value = createGhostElement(tab);
    updateGhostPosition(event.clientX, event.clientY);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  };

  const setDropZone = (paneId: string, index: number): void => {
    currentDropZone.value = { paneId, index };
  };

  const clearDropZone = (): void => {
    currentDropZone.value = null;
  };

  const setOnDrop = (callback: (tabId: string, sourcePaneId: string, targetPaneId: string, targetIndex: number) => void): void => {
    onDropCallback = callback;
  };

  const setOnDropOutside = (callback: (tabId: string, paneId: string, filePath: string | null) => void): void => {
    onDropOutsideCallback = callback;
  };

  const cancelDrag = (): void => {
    cleanup();
  };

  return {
    // State (readonly)
    isDragging: readonly(isDragging),
    draggedTab: readonly(draggedTab),
    currentDropZone: readonly(currentDropZone),
    mouseX: readonly(mouseX),
    mouseY: readonly(mouseY),

    // Actions
    startDrag,
    setDropZone,
    clearDropZone,
    setOnDrop,
    setOnDropOutside,
    cancelDrag,
  };
}
