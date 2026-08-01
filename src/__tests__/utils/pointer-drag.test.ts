import { describe, it, expect, beforeEach } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  exceedsThreshold,
  resolveDragSource,
  resolveDropHit,
  planMoves,
  autoScrollStep,
} from '../../utils/pointer-drag';

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById('root') as HTMLElement;
}

function q(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`missing fixture element: ${selector}`);
  return el;
}

describe('exceedsThreshold', () => {
  it('stays below the threshold for a jittery click', () => {
    expect(exceedsThreshold({ x: 10, y: 10 }, { x: 12, y: 10 })).toBe(false);
    expect(exceedsThreshold({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
  });

  it('trips once the pointer travels far enough in any direction', () => {
    expect(exceedsThreshold({ x: 10, y: 10 }, { x: 10 + DRAG_THRESHOLD_PX, y: 10 })).toBe(true);
    expect(exceedsThreshold({ x: 10, y: 10 }, { x: 10, y: 10 - DRAG_THRESHOLD_PX })).toBe(true);
    expect(exceedsThreshold({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
  });

  it('honours a custom threshold', () => {
    expect(exceedsThreshold({ x: 0, y: 0 }, { x: 5, y: 0 }, 10)).toBe(false);
    expect(exceedsThreshold({ x: 0, y: 0 }, { x: 11, y: 0 }, 10)).toBe(true);
  });
});

describe('resolveDragSource', () => {
  beforeEach(() => {
    mount(`
      <section data-ws-id="w1">
        <header data-section-index="0">
          <span class="ws-section-name" id="section-label">notes</span>
          <button class="ws-section-action" id="section-btn">x</button>
        </header>
        <div class="tree-row" data-tree-path="/notes/sub" data-tree-kind="folder">
          <span class="tree-chevron" id="chevron"></span>
          <span class="tree-label" id="folder-label">sub</span>
          <button class="tree-sort-btn" id="sort-btn">s</button>
        </div>
        <div class="tree-row" data-tree-path="/notes/a.md" data-tree-kind="file">
          <span class="tree-label" id="file-label">a.md</span>
        </div>
      </section>
    `);
  });

  it('resolves a tree row from any descendant', () => {
    expect(resolveDragSource(q('#file-label'))).toEqual({
      kind: 'node',
      path: '/notes/a.md',
      nodeKind: 'file',
    });
    expect(resolveDragSource(q('#folder-label'))).toEqual({
      kind: 'node',
      path: '/notes/sub',
      nodeKind: 'folder',
    });
  });

  it('resolves a section header', () => {
    expect(resolveDragSource(q('#section-label'))).toEqual({ kind: 'section', index: 0 });
  });

  it('refuses to start a drag from a button', () => {
    expect(resolveDragSource(q('#sort-btn'))).toBeNull();
    expect(resolveDragSource(q('#section-btn'))).toBeNull();
  });

  it('refuses to start a drag from the expand chevron', () => {
    expect(resolveDragSource(q('#chevron'))).toBeNull();
  });

  it('returns null outside any draggable row', () => {
    expect(resolveDragSource(q('#root'))).toBeNull();
    expect(resolveDragSource(null)).toBeNull();
  });
});

describe('resolveDropHit', () => {
  beforeEach(() => {
    mount(`
      <section data-ws-id="w1">
        <header data-section-index="2"><span id="hdr">notes</span></header>
        <div class="tree-row" data-tree-path="/notes/sub" data-tree-kind="folder">
          <span id="in-folder">sub</span>
        </div>
      </section>
      <div class="editor-pane" data-pane-id="right">
        <div class="ProseMirror" id="in-pane">text</div>
      </div>
      <div id="nowhere"></div>
    `);
  });

  it('reports the tree node under the pointer', () => {
    expect(resolveDropHit(q('#in-folder'))).toEqual({
      nodePath: '/notes/sub',
      nodeKind: 'folder',
      paneId: null,
      sectionIndex: null,
    });
  });

  it('reports the editor pane under the pointer', () => {
    expect(resolveDropHit(q('#in-pane')).paneId).toBe('right');
  });

  it('reports the section header under the pointer', () => {
    expect(resolveDropHit(q('#hdr')).sectionIndex).toBe(2);
  });

  it('reports nothing over neutral space', () => {
    expect(resolveDropHit(q('#nowhere'))).toEqual({
      nodePath: null,
      nodeKind: null,
      paneId: null,
      sectionIndex: null,
    });
    expect(resolveDropHit(null).nodePath).toBeNull();
  });
});

describe('planMoves', () => {
  it('moves each source into the destination folder', () => {
    expect(planMoves(['/notes/a.md', '/notes/b.md'], '/notes/sub')).toEqual([
      { from: '/notes/a.md', to: '/notes/sub/a.md' },
      { from: '/notes/b.md', to: '/notes/sub/b.md' },
    ]);
  });

  it('keeps the destination separator style on Windows paths', () => {
    expect(planMoves(['C:\\notes\\a.md'], 'C:\\notes\\sub')).toEqual([
      { from: 'C:\\notes\\a.md', to: 'C:\\notes\\sub\\a.md' },
    ]);
  });

  it('refuses to drop a folder into itself', () => {
    expect(planMoves(['/notes/sub'], '/notes/sub')).toEqual([]);
  });

  it('refuses to drop a folder into its own descendant', () => {
    expect(planMoves(['/notes/sub'], '/notes/sub/deep')).toEqual([]);
    expect(planMoves(['C:\\notes\\sub'], 'C:\\notes\\sub\\deep')).toEqual([]);
  });

  it('skips a source that already sits in the destination', () => {
    expect(planMoves(['/notes/sub/a.md'], '/notes/sub')).toEqual([]);
  });

  it('keeps the valid sources of a mixed selection', () => {
    expect(planMoves(['/notes/sub', '/notes/a.md'], '/notes/sub')).toEqual([
      { from: '/notes/a.md', to: '/notes/sub/a.md' },
    ]);
  });

  it('is empty for no sources or no destination', () => {
    expect(planMoves([], '/notes/sub')).toEqual([]);
    expect(planMoves(['/notes/a.md'], '')).toEqual([]);
  });
});

describe('autoScrollStep', () => {
  const rect = { top: 100, bottom: 500 };

  it('does not scroll in the middle of the list', () => {
    expect(autoScrollStep(300, rect)).toBe(0);
  });

  it('scrolls up near the top edge and down near the bottom edge', () => {
    expect(autoScrollStep(105, rect)).toBeLessThan(0);
    expect(autoScrollStep(495, rect)).toBeGreaterThan(0);
  });

  it('scrolls faster the closer the pointer gets to the edge', () => {
    expect(Math.abs(autoScrollStep(101, rect))).toBeGreaterThan(Math.abs(autoScrollStep(120, rect)));
  });

  it('keeps scrolling once the pointer passes the edge', () => {
    expect(autoScrollStep(40, rect)).toBeLessThan(0);
    expect(autoScrollStep(600, rect)).toBeGreaterThan(0);
  });
});
