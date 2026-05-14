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
    expect(result).not.toMatch(/<foreignObject[\s>]/);
    expect(result).toContain('Node Label');
    expect(result).toMatch(/<text[^>]*>[\s\S]*Node Label[\s\S]*<\/text>/);
  });

  it('preserves word spacing between sibling spans in Mermaid labels', () => {
    const el = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-code', encodeURIComponent('graph LR'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', '0');
    fo.setAttribute('y', '0');
    fo.setAttribute('width', '100');
    fo.setAttribute('height', '40');
    // Mermaid emits multi-span labels — earlier serializer concatenated them
    // into `F1Wykres przypisanydo konkretnego` (no spaces).
    fo.innerHTML = '<div><span>F1</span><span>Wykres przypisany</span><span>do konkretnego</span></div>';
    svg.appendChild(fo);
    wrapper.appendChild(svg);
    el.appendChild(wrapper);

    const result = serializeEditorContent(el);
    expect(result).toContain('F1 Wykres przypisany do konkretnego');
    expect(result).not.toContain('F1Wykres');
  });

  it('splits Mermaid labels on <br> / <p> into separate tspan lines', () => {
    const el = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-code', encodeURIComponent('graph LR'));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', '0');
    fo.setAttribute('y', '0');
    fo.setAttribute('width', '120');
    fo.setAttribute('height', '60');
    fo.innerHTML = '<p>Line one</p><p>Line two</p>';
    svg.appendChild(fo);
    wrapper.appendChild(svg);
    el.appendChild(wrapper);

    const result = serializeEditorContent(el);
    expect(result).toContain('Line one');
    expect(result).toContain('Line two');
    expect((result.match(/<tspan/g) || []).length).toBeGreaterThanOrEqual(2);
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

  it('linkifies footnote refs and definitions', () => {
    const el = document.createElement('div');
    el.innerHTML = `
      <p>Text<sup data-footnote-ref="1" class="footnote-ref">1</sup> more.</p>
      <section data-footnotes class="footnotes">
        <ol>
          <li data-footnote-id="1"><p>Footnote body.</p></li>
        </ol>
      </section>
    `;
    const result = serializeEditorContent(el);
    expect(result).toContain('id="fnref-1"');
    expect(result).toContain('href="#fn-1"');
    expect(result).toContain('id="fn-1"');
    expect(result).toContain('href="#fnref-1"');
    expect(result).toContain('↩');
  });

  it('normalizes Vue NodeView footnote section into canonical print form', () => {
    const el = document.createElement('div');
    el.innerHTML = `
      <p>Text<sup data-footnote-ref="1" class="footnote-ref">1</sup> more.</p>
      <div class="footnote-section-wrapper" data-node-view-wrapper>
        <div class="footnote-header"><span class="footnote-label">Footnotes</span></div>
        <ol class="footnote-list">
          <li class="footnote-item" data-index="0" data-footnote-label="1">
            <span class="footnote-def-index">1.</span>
            <span class="footnote-def-content">Footnote body.</span>
            <button class="footnote-backlink">↩</button>
          </li>
        </ol>
      </div>
    `;
    const result = serializeEditorContent(el);
    expect(result).toContain('data-footnotes');
    expect(result).toContain('id="fn-1"');
    expect(result).toContain('href="#fn-1"');
    expect(result).toContain('id="fnref-1"');
    expect(result).toContain('Footnote body.');
    expect(result).not.toContain('footnote-section-wrapper');
    expect(result).not.toContain('footnote-edit-input');
    expect(result).not.toContain('footnote-backlink');
  });

  it('assigns slugified IDs to headings', () => {
    const el = document.createElement('div');
    el.innerHTML = `<h1>Introduction</h1><h2>Background &amp; Context</h2><h2>Background &amp; Context</h2>`;
    const result = serializeEditorContent(el);
    expect(result).toContain('id="pdf-h-introduction"');
    expect(result).toContain('id="pdf-h-background-context"');
    expect(result).toContain('id="pdf-h-background-context-2"');
  });

  it('strips dark-mode override style block from cloned SVG', () => {
    const el = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-code', encodeURIComponent('g'));
    const content = document.createElement('div');
    content.className = 'mermaid-content';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.id = 'mermark-mermaid-dark-override';
    style.textContent = 'rect { fill: #1a1a1a !important; }';
    svg.appendChild(style);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('fill', '#1a1a1a');
    svg.appendChild(rect);
    content.appendChild(svg);
    wrapper.appendChild(content);
    el.appendChild(wrapper);

    const result = serializeEditorContent(el);
    expect(result).not.toContain('mermark-mermaid-dark-override');
    // Original dark fill replaced; our own light-override style is allowed to have !important
    expect(result).toContain('fill="#ffffff"');
    expect(result).toContain('mermark-print-light-override');
  });

  it('strips !important inline fill from cloned elements', () => {
    const el = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-code', encodeURIComponent('g'));
    const content = document.createElement('div');
    content.className = 'mermaid-content';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('fill', '#1a1a1a');
    (rect as SVGRectElement).style.setProperty('fill', '#1a1a1a', 'important');
    (rect as SVGRectElement).style.setProperty('stroke', '#333', 'important');
    svg.appendChild(rect);
    content.appendChild(svg);
    wrapper.appendChild(content);
    el.appendChild(wrapper);

    const result = serializeEditorContent(el);
    // The rect's own inline !important fill should be gone; the injected
    // light-override style block contains !important by design (skip it).
    const figureMatch = result.match(/<figure class="mermaid-print-figure">[\s\S]*?<\/figure>/);
    expect(figureMatch).toBeTruthy();
    const figure = figureMatch![0];
    // Strip our injected style block before asserting
    const withoutOverride = figure.replace(/<style id="mermark-print-light-override">[\s\S]*?<\/style>/, '');
    expect(withoutOverride).not.toMatch(/!important/);
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
