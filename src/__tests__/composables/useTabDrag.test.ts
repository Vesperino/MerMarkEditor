import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useTabDrag, type DraggedTab } from '../../composables/useTabDrag';

describe('useTabDrag', () => {
  let tabDrag: ReturnType<typeof useTabDrag>;

  beforeEach(() => {
    tabDrag = useTabDrag();
    tabDrag.cancelDrag();
  });

  afterEach(() => {
    tabDrag.cancelDrag();
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should not be dragging initially', () => {
      expect(tabDrag.isDragging.value).toBe(false);
    });

    it('should have no dragged tab initially', () => {
      expect(tabDrag.draggedTab.value).toBeNull();
    });

    it('should have no current drop zone initially', () => {
      expect(tabDrag.currentDropZone.value).toBeNull();
    });
  });

  describe('startDrag', () => {
    it('should set isDragging to true', () => {
      const tab: DraggedTab = {
        tabId: 'tab-1',
        paneId: 'left',
        fileName: 'test.md',
        filePath: '/path/to/test.md',
        element: document.createElement('div'),
      };
      const event = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });

      tabDrag.startDrag(tab, event);

      expect(tabDrag.isDragging.value).toBe(true);
    });

    it('should set the dragged tab', () => {
      const tab: DraggedTab = {
        tabId: 'tab-1',
        paneId: 'left',
        fileName: 'test.md',
        filePath: '/path/to/test.md',
        element: document.createElement('div'),
      };
      const event = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });

      tabDrag.startDrag(tab, event);

      expect(tabDrag.draggedTab.value).toEqual(tab);
    });

    it('should track mouse position', () => {
      const tab: DraggedTab = {
        tabId: 'tab-1',
        paneId: 'left',
        fileName: 'test.md',
        filePath: null,
        element: null,
      };
      const event = new MouseEvent('mousedown', { clientX: 150, clientY: 200 });

      tabDrag.startDrag(tab, event);

      expect(tabDrag.mouseX.value).toBe(150);
      expect(tabDrag.mouseY.value).toBe(200);
    });

    it('should not start drag if already dragging', () => {
      const tab1: DraggedTab = {
        tabId: 'tab-1',
        paneId: 'left',
        fileName: 'test1.md',
        filePath: null,
        element: null,
      };
      const tab2: DraggedTab = {
        tabId: 'tab-2',
        paneId: 'right',
        fileName: 'test2.md',
        filePath: null,
        element: null,
      };
      const event1 = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
      const event2 = new MouseEvent('mousedown', { clientX: 200, clientY: 200 });

      tabDrag.startDrag(tab1, event1);
      tabDrag.startDrag(tab2, event2);

      expect(tabDrag.draggedTab.value?.tabId).toBe('tab-1');
    });

    it('should set cursor style on body', () => {
      const tab: DraggedTab = {
        tabId: 'tab-1',
        paneId: 'left',
        fileName: 'test.md',
        filePath: null,
        element: null,
      };
      const event = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });

      tabDrag.startDrag(tab, event);

      expect(document.body.style.cursor).toBe('grabbing');
      expect(document.body.style.userSelect).toBe('none');
    });
  });

  describe('setDropZone', () => {
    it('should set the current drop zone', () => {
      tabDrag.setDropZone('left', 2);

      expect(tabDrag.currentDropZone.value).toEqual({
        paneId: 'left',
        index: 2,
      });
    });

    it('should update drop zone when called multiple times', () => {
      tabDrag.setDropZone('left', 0);
      tabDrag.setDropZone('right', 3);

      expect(tabDrag.currentDropZone.value).toEqual({
        paneId: 'right',
        index: 3,
      });
    });
  });

  describe('clearDropZone', () => {
    it('should clear the current drop zone', () => {
      tabDrag.setDropZone('left', 2);
      tabDrag.clearDropZone();

      expect(tabDrag.currentDropZone.value).toBeNull();
    });
  });

  describe('setOnDrop', () => {
    it('should call the callback when tab is dropped on drop zone', () => {
      const onDropCallback = vi.fn();
      tabDrag.setOnDrop(onDropCallback);

      const tab: DraggedTab = {
        tabId: 'tab-1',
        paneId: 'left',
        fileName: 'test.md',
        filePath: null,
        element: null,
      };
      const startEvent = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });

      tabDrag.startDrag(tab, startEvent);
      tabDrag.setDropZone('right', 1);

      const mouseUpEvent = new MouseEvent('mouseup', { clientX: 100, clientY: 100 });
      document.dispatchEvent(mouseUpEvent);

      expect(onDropCallback).toHaveBeenCalledWith('tab-1', 'left', 'right', 1);
    });
  });

  describe('setOnDropOutside', () => {
    it('should call the callback when tab is dropped outside window', () => {
      const onDropOutsideCallback = vi.fn();
      tabDrag.setOnDropOutside(onDropOutsideCallback);

      const tab: DraggedTab = {
        tabId: 'tab-1',
        paneId: 'left',
        fileName: 'test.md',
        filePath: '/path/to/test.md',
        element: null,
      };
      const startEvent = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });

      tabDrag.startDrag(tab, startEvent);

      const mouseUpEvent = new MouseEvent('mouseup', { clientX: -50, clientY: 100 });
      document.dispatchEvent(mouseUpEvent);

      expect(onDropOutsideCallback).toHaveBeenCalledWith('tab-1', 'left', '/path/to/test.md');
    });
  });

  describe('cancelDrag', () => {
    it('should reset all drag state', () => {
      const tab: DraggedTab = {
        tabId: 'tab-1',
        paneId: 'left',
        fileName: 'test.md',
        filePath: null,
        element: null,
      };
      const event = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });

      tabDrag.startDrag(tab, event);
      tabDrag.setDropZone('right', 1);
      tabDrag.cancelDrag();

      expect(tabDrag.isDragging.value).toBe(false);
      expect(tabDrag.draggedTab.value).toBeNull();
      expect(tabDrag.currentDropZone.value).toBeNull();
    });

    it('should reset body styles', () => {
      const tab: DraggedTab = {
        tabId: 'tab-1',
        paneId: 'left',
        fileName: 'test.md',
        filePath: null,
        element: null,
      };
      const event = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });

      tabDrag.startDrag(tab, event);
      tabDrag.cancelDrag();

      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
    });
  });

  describe('singleton pattern', () => {
    it('should share state between multiple calls', () => {
      const tabDrag1 = useTabDrag();
      const tabDrag2 = useTabDrag();

      tabDrag1.setDropZone('left', 5);

      expect(tabDrag2.currentDropZone.value).toEqual({
        paneId: 'left',
        index: 5,
      });
    });
  });
});
