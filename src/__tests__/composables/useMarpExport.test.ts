import { describe, it, expect, vi } from 'vitest';

vi.mock('@marp-team/marp-core', () => ({
  Marp: class {
    render(markdown: string) {
      return { html: `<section>${markdown}</section>`, css: 'section { color: red; }' };
    }
  },
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile: vi.fn() }));

import { splitSlides, buildStandaloneHtml, renderDeck } from '../../composables/useMarpExport';

describe('splitSlides', () => {
  it('yields multiple slides for multiple --- separators', () => {
    const md = '# One\n\n---\n\n# Two\n\n---\n\n# Three';
    const slides = splitSlides(md);
    expect(slides).toHaveLength(3);
    expect(slides[0]).toContain('# One');
    expect(slides[1]).toContain('# Two');
    expect(slides[2]).toContain('# Three');
  });

  it('yields a single slide when there is no separator', () => {
    const slides = splitSlides('# Only slide\n\nsome body text');
    expect(slides).toHaveLength(1);
  });

  it('does not treat the leading YAML front-matter fence as a separator', () => {
    const md = '---\nmarp: true\ntheme: default\n---\n# A\n\n---\n\n# B';
    const slides = splitSlides(md);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toContain('marp: true');
    expect(slides[0]).toContain('# A');
    expect(slides[1]).toContain('# B');
  });

  it('counts separators with trailing whitespace', () => {
    const md = '# A\n--- \n# B';
    expect(splitSlides(md)).toHaveLength(2);
  });
});

describe('renderDeck', () => {
  it('forwards markdown to an injected renderer and returns html + css', () => {
    const render = vi.fn(() => ({ html: '<section>x</section>', css: 'section{}' }));
    const result = renderDeck('# hi', { render });
    expect(render).toHaveBeenCalledWith('# hi');
    expect(result.html).toBe('<section>x</section>');
    expect(result.css).toBe('section{}');
  });

  it('uses the bundled Marp renderer when none is injected', () => {
    const result = renderDeck('# hi');
    expect(result.html).toContain('<section>');
    expect(result.css).toContain('section');
  });
});

describe('buildStandaloneHtml', () => {
  const deck = { html: '<section>slide</section>', css: 'section { color: red; }' };

  it('produces a valid HTML5 doctype', () => {
    expect(buildStandaloneHtml(deck)).toMatch(/^<!DOCTYPE html>/i);
  });

  it('embeds the css inside a style block', () => {
    const out = buildStandaloneHtml(deck);
    expect(out).toContain('<style>');
    expect(out).toContain('section { color: red; }');
  });

  it('embeds the rendered html in the body', () => {
    expect(buildStandaloneHtml(deck)).toContain('<section>slide</section>');
  });

  it('embeds the escaped title', () => {
    expect(buildStandaloneHtml(deck, 'My Deck')).toContain('<title>My Deck</title>');
    expect(buildStandaloneHtml(deck, 'A & B')).toContain('<title>A &amp; B</title>');
  });
});
