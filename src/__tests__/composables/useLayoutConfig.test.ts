import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { useLayoutConfig, loadLayoutConfig } from '../../composables/useLayoutConfig';
import { TOOLBAR_ITEMS } from '../../data/toolbarItems';

describe('useLayoutConfig', () => {
  beforeEach(() => {
    localStorage.removeItem('mermark-layout');
    // Reset singleton by calling resetToDefaults
    const { resetToDefaults } = useLayoutConfig();
    resetToDefaults();
  });

  describe('initialization', () => {
    it('creates default placements for all toolbar items', () => {
      const { layoutConfig } = useLayoutConfig();
      expect(layoutConfig.value.version).toBe(3);
      expect(layoutConfig.value.placements.length).toBe(TOOLBAR_ITEMS.length);
    });

    it('most items default to the toolbar zone (zoom slider lives in the status bar)', () => {
      const { itemsForZone } = useLayoutConfig();
      const expectedToolbar = TOOLBAR_ITEMS.filter((i) => i.id !== 'zoom-controls').length;
      expect(itemsForZone('toolbar').value.length).toBe(expectedToolbar);
    });

    it('status bar contains the zoom slider by default; left bar starts empty', () => {
      const { itemsForZone } = useLayoutConfig();
      expect(itemsForZone('statusbar').value.map((i) => i.id)).toEqual(['zoom-controls']);
      expect(itemsForZone('leftbar').value.length).toBe(0);
    });
  });

  describe('moveItem', () => {
    it('moves item to a different zone', () => {
      const { moveItem, itemsForZone } = useLayoutConfig();
      moveItem('stats', 'statusbar');

      const statusbarItems = itemsForZone('statusbar');
      expect(statusbarItems.value.some(i => i.id === 'stats')).toBe(true);

      const toolbarItems = itemsForZone('toolbar');
      expect(toolbarItems.value.some(i => i.id === 'stats')).toBe(false);
    });

    it('moves item to hidden zone', () => {
      const { moveItem, itemsForZone } = useLayoutConfig();
      moveItem('mermaid', 'hidden');

      const hiddenItems = itemsForZone('hidden');
      expect(hiddenItems.value.some(i => i.id === 'mermaid')).toBe(true);
    });
  });

  describe('reorderItems', () => {
    it('reorders items within a zone', () => {
      const { reorderItems, itemsForZone } = useLayoutConfig();
      const original = itemsForZone('toolbar').value.map(i => i.id);

      // Move last item to first
      const reordered = [original[original.length - 1], ...original.slice(0, -1)];
      reorderItems('toolbar', reordered);

      const result = itemsForZone('toolbar').value.map(i => i.id);
      expect(result[0]).toBe(original[original.length - 1]);
    });

    it('can move item to a new zone via reorderItems', () => {
      const { reorderItems, itemsForZone } = useLayoutConfig();
      reorderItems('statusbar', ['zoom-controls', 'stats']);

      const statusbarItems = itemsForZone('statusbar');
      expect(statusbarItems.value.length).toBe(2);
      expect(statusbarItems.value[0].id).toBe('zoom-controls');
      expect(statusbarItems.value[1].id).toBe('stats');
    });
  });

  describe('toggleVisibility', () => {
    it('hides an item', () => {
      const { toggleVisibility, itemsForZone } = useLayoutConfig();
      toggleVisibility('mermaid');

      expect(itemsForZone('hidden').value.some(i => i.id === 'mermaid')).toBe(true);
      expect(itemsForZone('toolbar').value.some(i => i.id === 'mermaid')).toBe(false);
    });

    it('restores a hidden item to its default zone', () => {
      const { toggleVisibility, itemsForZone } = useLayoutConfig();
      toggleVisibility('mermaid'); // hide
      toggleVisibility('mermaid'); // restore

      expect(itemsForZone('toolbar').value.some(i => i.id === 'mermaid')).toBe(true);
      expect(itemsForZone('hidden').value.some(i => i.id === 'mermaid')).toBe(false);
    });
  });

  describe('hasStatusBarItems / hasLeftBarItems', () => {
    it('status bar reports true at startup (zoom slider lives there); left bar empty', () => {
      const { hasStatusBarItems, hasLeftBarItems } = useLayoutConfig();
      expect(hasStatusBarItems.value).toBe(true);
      expect(hasLeftBarItems.value).toBe(false);
    });

    it('returns true when items are moved to zones', () => {
      const { moveItem, hasStatusBarItems, hasLeftBarItems } = useLayoutConfig();
      moveItem('stats', 'statusbar');
      expect(hasStatusBarItems.value).toBe(true);

      moveItem('bold', 'leftbar');
      expect(hasLeftBarItems.value).toBe(true);
    });
  });

  describe('resetToDefaults', () => {
    it('restores original layout after modifications', () => {
      const { moveItem, resetToDefaults, itemsForZone } = useLayoutConfig();
      moveItem('stats', 'statusbar');
      moveItem('bold', 'leftbar');

      resetToDefaults();

      // Status bar always has the zoom slider as its sole default tenant.
      expect(itemsForZone('statusbar').value.map((i) => i.id)).toEqual(['zoom-controls']);
      expect(itemsForZone('leftbar').value.length).toBe(0);
      const expectedToolbar = TOOLBAR_ITEMS.filter((i) => i.id !== 'zoom-controls').length;
      expect(itemsForZone('toolbar').value.length).toBe(expectedToolbar);
    });
  });

  describe('persistence', () => {
    it('saves to localStorage on change', async () => {
      const { moveItem } = useLayoutConfig();
      moveItem('stats', 'statusbar');

      // watch is async, wait for it to flush
      await nextTick();

      const saved = localStorage.getItem('mermark-layout');
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved!);
      expect(parsed.placements.find((p: any) => p.id === 'stats').zone).toBe('statusbar');
    });
  });
});


describe('layout presets and migration', () => {
  it('keeps Full as the fresh-install default', () => {
    localStorage.removeItem('mermark-layout');
    expect(loadLayoutConfig().preset).toBe('full');
  });

  it.each([1, 2])('preserves all-hidden version %s layouts and legacy zoom placement', version => {
    const placements = TOOLBAR_ITEMS.map(i => ({ id: i.id, zone: i.id === 'zoom-controls' ? 'toolbar' : 'hidden', order: i.defaultOrder }));
    localStorage.setItem('mermark-layout', JSON.stringify({ version, placements }));
    expect(loadLayoutConfig()).toEqual({ version: 3, preset: 'custom', placements });
  });

  it.each(['custom', 'minimal'])('does not expose newly registered controls in %s layouts', preset => {
    localStorage.setItem('mermark-layout', JSON.stringify({ version: 3, preset, placements: [] }));
    expect(loadLayoutConfig().placements.find(p => p.id === 'save-file')?.zone).toBe('hidden');
  });

  it('persists Minimal, marks manual edits Custom, and restores Full', async () => {
    const layout = useLayoutConfig();
    layout.applyPreset('minimal');
    expect(layout.itemsForZone('toolbar').value).toHaveLength(0);
    expect(layout.itemsForZone('statusbar').value.map(p => p.id)).toEqual([
      'toggle-workspace-sidebar', 'stats', 'zoom-controls', 'ai-toggle', 'toggle-code-view',
    ]);
    await nextTick();
    expect(loadLayoutConfig().preset).toBe('minimal');
    layout.moveItem('bold', 'toolbar');
    expect(layout.layoutConfig.value.preset).toBe('custom');
    layout.resetToDefaults();
    expect(layout.layoutConfig.value.preset).toBe('full');
    expect(layout.itemsForZone('hidden').value).toHaveLength(0);
  });
});
