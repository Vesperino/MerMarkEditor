import { describe, it, expect } from 'vitest';
import { serializeEditorContent } from '../../utils/documentSerializer';

describe('serializeEditorContent', () => {
  it('returns HTML string', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>Hello world</p>';
    const result = serializeEditorContent(el);
    expect(typeof result).toBe('string');
    expect(result).toContain('Hello world');
  });

  it('strips contenteditable attributes', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p contenteditable="true">Hello</p>';
    const result = serializeEditorContent(el);
    expect(result).not.toContain('contenteditable');
  });

  it('strips data-node-view-wrapper attributes', () => {
    const el = document.createElement('div');
    el.innerHTML = '<div data-node-view-wrapper=""><p>text</p></div>';
    const result = serializeEditorContent(el);
    expect(result).not.toContain('data-node-view-wrapper');
  });

  it('replaces mermaid node wrapper with inline SVG figure', () => {
    const el = document.createElement('div');
    const mermaidWrapper = document.createElement('div');
    mermaidWrapper.setAttribute('data-code', encodeURIComponent('graph LR\n  A-->B'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 50');
    mermaidWrapper.appendChild(svg);
    el.appendChild(mermaidWrapper);

    const result = serializeEditorContent(el);
    expect(result).toContain('class="mermaid-print-figure"');
    expect(result).toContain('<svg');
    expect(result).not.toContain('data-code');
  });

  it('preserves regular paragraphs unchanged', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>First</p><p>Second</p>';
    const result = serializeEditorContent(el);
    expect(result).toContain('<p>First</p>');
    expect(result).toContain('<p>Second</p>');
  });

  it('handles mermaid node with no SVG (render failed) gracefully', () => {
    const el = document.createElement('div');
    const mermaidWrapper = document.createElement('div');
    mermaidWrapper.setAttribute('data-code', encodeURIComponent('invalid'));
    el.appendChild(mermaidWrapper);

    const result = serializeEditorContent(el);
    expect(typeof result).toBe('string');
  });
});
