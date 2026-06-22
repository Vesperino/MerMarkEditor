import { ref, computed, watch } from 'vue';
import { TOOLBAR_ITEMS, getItemDef, type ToolbarZone } from '../data/toolbarItems';

export type LayoutZone = ToolbarZone | 'hidden';

export interface LayoutItemPlacement {
  id: string;
  zone: LayoutZone;
  order: number;
}

export interface LayoutConfig {
  version: number;
  placements: LayoutItemPlacement[];
}

const STORAGE_KEY = 'mermark-layout';
const CONFIG_VERSION = 2;

function generateDefaults(): LayoutItemPlacement[] {
  return TOOLBAR_ITEMS.map(item => ({
    id: item.id,
    zone: item.defaultZone as LayoutZone,
    order: item.defaultOrder,
  }));
}

function loadConfig(): LayoutConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as LayoutConfig;
      if (parsed.version >= 1 && parsed.version <= CONFIG_VERSION && Array.isArray(parsed.placements)) {
        // Ensure all registry items exist in placements (handles new items added in updates)
        const existingIds = new Set(parsed.placements.map(p => p.id));
        const defaults = generateDefaults();
        for (const def of defaults) {
          if (!existingIds.has(def.id)) {
            parsed.placements.push(def);
          }
        }
        // Remove placements for items no longer in registry
        const registryIds = new Set(TOOLBAR_ITEMS.map(i => i.id));
        parsed.placements = parsed.placements.filter(p => registryIds.has(p.id));
        // Migration: if a saved placement lands in a zone that's now
        // disallowed for that item (e.g. stats was previously dropped into
        // leftbar before the restriction existed), move it back to its
        // registered defaultZone.
        for (const p of parsed.placements) {
          if (p.zone !== 'hidden') {
            const def = getItemDef(p.id);
            if (def?.disallowedZones?.includes(p.zone as ToolbarZone)) {
              p.zone = def.defaultZone;
              p.order = def.defaultOrder;
            }
          }
        }
        // Migration v1 -> v2: zoom-controls' defaultZone changed from 'toolbar'
        // to 'statusbar'. Layouts saved under the old default keep zoom in the
        // toolbar; move it to the status bar unless the user parked it elsewhere
        // (hidden, leftbar, …) — those count as "set otherwise" and stay put.
        if (parsed.version < 2) {
          const zoom = parsed.placements.find(p => p.id === 'zoom-controls');
          if (zoom && zoom.zone === 'toolbar') {
            const def = getItemDef('zoom-controls');
            zoom.zone = def?.defaultZone ?? 'statusbar';
            zoom.order = def?.defaultOrder ?? 1000;
          }
          parsed.version = CONFIG_VERSION;
        }
        return parsed;
      }
    }
  } catch (error) {
    console.error('Error loading layout config:', error);
  }
  return { version: CONFIG_VERSION, placements: generateDefaults() };
}

function saveConfig(config: LayoutConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error saving layout config:', error);
  }
}

// Singleton state
const layoutConfig = ref<LayoutConfig>(loadConfig());

// Auto-save on changes
watch(layoutConfig, (newConfig) => {
  saveConfig(newConfig);
}, { deep: true });

/** True when the given item is allowed in the given zone. 'hidden' is always
 *  allowed; non-toolbar zones are checked against the item's disallowedZones. */
export function isZoneAllowedForItem(itemId: string, zone: LayoutZone): boolean {
  if (zone === 'hidden') return true;
  const def = getItemDef(itemId);
  if (!def?.disallowedZones?.length) return true;
  return !def.disallowedZones.includes(zone);
}

export function useLayoutConfig() {
  function itemsForZone(zone: LayoutZone) {
    return computed(() =>
      layoutConfig.value.placements
        .filter(p => p.zone === zone)
        .sort((a, b) => a.order - b.order)
    );
  }

  function moveItem(itemId: string, toZone: LayoutZone): void {
    if (!isZoneAllowedForItem(itemId, toZone)) return;
    const placement = layoutConfig.value.placements.find(p => p.id === itemId);
    if (placement) {
      // Get max order in target zone and add after it
      const zoneItems = layoutConfig.value.placements.filter(p => p.zone === toZone);
      const maxOrder = zoneItems.length > 0 ? Math.max(...zoneItems.map(p => p.order)) : 0;
      placement.zone = toZone;
      placement.order = maxOrder + 10;
    }
  }

  function reorderItems(zone: LayoutZone, orderedIds: string[]): void {
    orderedIds.forEach((id, index) => {
      // Reject items that aren't allowed in this zone — leaves their existing
      // placement untouched so a stray drop into a disallowed zone is a no-op.
      if (!isZoneAllowedForItem(id, zone)) return;
      const placement = layoutConfig.value.placements.find(p => p.id === id);
      if (placement) {
        placement.zone = zone;
        placement.order = (index + 1) * 10;
      }
    });
  }

  function toggleVisibility(itemId: string): void {
    const placement = layoutConfig.value.placements.find(p => p.id === itemId);
    if (!placement) return;

    if (placement.zone === 'hidden') {
      // Restore to default zone
      const def = TOOLBAR_ITEMS.find(i => i.id === itemId);
      if (def) {
        placement.zone = def.defaultZone;
        const zoneItems = layoutConfig.value.placements.filter(p => p.zone === def.defaultZone);
        const maxOrder = zoneItems.length > 0 ? Math.max(...zoneItems.map(p => p.order)) : 0;
        placement.order = maxOrder + 10;
      }
    } else {
      placement.zone = 'hidden';
    }
  }

  function resetToDefaults(): void {
    layoutConfig.value = { version: CONFIG_VERSION, placements: generateDefaults() };
  }

  const hasStatusBarItems = computed(() =>
    layoutConfig.value.placements.some(p => p.zone === 'statusbar')
  );

  const hasLeftBarItems = computed(() =>
    layoutConfig.value.placements.some(p => p.zone === 'leftbar')
  );

  return {
    layoutConfig,
    itemsForZone,
    moveItem,
    reorderItems,
    toggleVisibility,
    resetToDefaults,
    hasStatusBarItems,
    hasLeftBarItems,
    isZoneAllowedForItem,
  };
}
