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

  it('converts foreignObject labels to SVG text elements', () => {
    const el = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-code', encodeURIComponent('graph LR\n  A-->B'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 100');
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', '10');
    fo.setAttribute('y', '20');
    fo.setAttribute('width', '80');
    fo.setAttribute('height', '40');
    fo.textContent = 'Node Label';
    svg.appendChild(fo);
    wrapper.appendChild(svg);
    el.appendChild(wrapper);

    const result = serializeEditorContent(el);
    expect(result).not.toContain('foreignObject');
    expect(result).toContain('Node Label');
    expect(result).toMatch(/<text[^>]*>Node Label<\/text>/);
  });

  it('replaces dark background fill with white', () => {
    const el = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-code', encodeURIComponent('graph LR'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '500');
    bgRect.setAttribute('height', '300');
    bgRect.setAttribute('fill', '#1f2020');
    svg.appendChild(bgRect);
    wrapper.appendChild(svg);
    el.appendChild(wrapper);

    const result = serializeEditorContent(el);
    expect(result).not.toContain('fill="#1f2020"');
    expect(result).toContain('fill="#ffffff"');
  });

  it('picks the diagram SVG inside .mermaid-content, not toolbar icons', () => {
    const el = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-code', encodeURIComponent('graph LR'));

    // Toolbar with icon SVGs (should be skipped)
    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-toolbar';
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    const iconLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    iconLine.setAttribute('x1', '5');
    iconLine.setAttribute('y1', '12');
    iconLine.setAttribute('x2', '19');
    iconLine.setAttribute('y2', '12');
    iconLine.setAttribute('stroke', 'currentColor');
    iconSvg.appendChild(iconLine);
    toolbar.appendChild(iconSvg);
    wrapper.appendChild(toolbar);

    // Real Mermaid SVG inside .mermaid-content
    const content = document.createElement('div');
    content.className = 'mermaid-content';
    const diagramSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    diagramSvg.setAttribute('id', 'mermaid-real-diagram');
    diagramSvg.setAttribute('viewBox', '0 0 800 400');
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    node.setAttribute('width', '100');
    node.setAttribute('height', '50');
    node.setAttribute('fill', '#abcdef');
    diagramSvg.appendChild(node);
    content.appendChild(diagramSvg);
    wrapper.appendChild(content);

    el.appendChild(wrapper);

    const result = serializeEditorContent(el);
    // The real diagram SVG (with id) made it through
    expect(result).toContain('mermaid-real-diagram');
    expect(result).toContain('fill="#abcdef"');
    // The toolbar icon's <line> should NOT be in the figure (its parent SVG was excluded)
    const figureMatch = result.match(/<figure class="mermaid-print-figure">[\s\S]*?<\/figure>/);
    expect(figureMatch).toBeTruthy();
    expect(figureMatch![0]).not.toContain('stroke="currentColor"');
  });

  it('does not touch light fills (no regression on light theme)', () => {
    const el = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-code', encodeURIComponent('x'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('fill', '#f8f8f8');
    svg.appendChild(r);
    wrapper.appendChild(svg);
    el.appendChild(wrapper);

    const result = serializeEditorContent(el);
    expect(result).toContain('fill="#f8f8f8"');
  });
});
