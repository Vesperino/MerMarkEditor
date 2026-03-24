import { describe, it, expect } from 'vitest';
import { TOOLBAR_ITEMS, getItemDef } from '../../data/toolbarItems';

describe('toolbarItems registry', () => {
  it('has unique item IDs', () => {
    const ids = TOOLBAR_ITEMS.map(i => i.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all items have required fields', () => {
    for (const item of TOOLBAR_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.category).toBeTruthy();
      expect(item.defaultZone).toBeTruthy();
      expect(typeof item.defaultOrder).toBe('number');
      expect(typeof item.needsEditor).toBe('boolean');
      expect(item.labelKey).toBeTruthy();
    }
  });

  it('all items default to toolbar zone', () => {
    for (const item of TOOLBAR_ITEMS) {
      expect(item.defaultZone).toBe('toolbar');
    }
  });

  it('stats is a single grouped item', () => {
    const statsItems = TOOLBAR_ITEMS.filter(i => i.category === 'stats');
    expect(statsItems.length).toBe(1);
    expect(statsItems[0].id).toBe('stats');
  });

  it('getItemDef returns correct item', () => {
    const def = getItemDef('bold');
    expect(def).toBeDefined();
    expect(def!.category).toBe('text-format');
    expect(def!.needsEditor).toBe(true);
  });

  it('getItemDef returns undefined for unknown id', () => {
    expect(getItemDef('nonexistent')).toBeUndefined();
  });

  it('editor items have needsEditor=true', () => {
    const editorItems = ['bold', 'italic', 'undo', 'redo', 'heading-select', 'table', 'link', 'mermaid'];
    for (const id of editorItems) {
      const def = getItemDef(id);
      expect(def?.needsEditor, `${id} should need editor`).toBe(true);
    }
  });

  it('non-editor items have needsEditor=false', () => {
    const nonEditorItems = ['new-file', 'save-file', 'stats', 'zoom-controls', 'toggle-code-view'];
    for (const id of nonEditorItems) {
      const def = getItemDef(id);
      expect(def?.needsEditor, `${id} should not need editor`).toBe(false);
    }
  });
});
