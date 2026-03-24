import { ref, computed, watch } from 'vue';
import { TOOLBAR_ITEMS, type ToolbarZone } from '../data/toolbarItems';

export type LayoutZone = ToolbarZone | 'hidden';

export interface LayoutItemPlacement {
  id: string;
  zone: LayoutZone;
  order: number;
}

export interface LayoutConfig {
  version: 1;
  placements: LayoutItemPlacement[];
}

const STORAGE_KEY = 'mermark-layout';

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
      if (parsed.version === 1 && Array.isArray(parsed.placements)) {
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
        return parsed;
      }
    }
  } catch (error) {
    console.error('Error loading layout config:', error);
  }
  return { version: 1, placements: generateDefaults() };
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

export function useLayoutConfig() {
  function itemsForZone(zone: LayoutZone) {
    return computed(() =>
      layoutConfig.value.placements
        .filter(p => p.zone === zone)
        .sort((a, b) => a.order - b.order)
    );
  }

  function moveItem(itemId: string, toZone: LayoutZone): void {
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
    layoutConfig.value = { version: 1, placements: generateDefaults() };
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
  };
}
