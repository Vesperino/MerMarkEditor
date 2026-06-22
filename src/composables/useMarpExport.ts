import { Marp } from '@marp-team/marp-core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

// Direct .pdf export is deferred: Marp renders self-contained HTML, and users
// print that to PDF from any browser/Chromium. Theme/directive customization is
// authored by the user via `marp: true` front-matter in their own markdown.

export interface MarpRenderResult {
  html: string;
  css: string;
}

export interface MarpRenderer {
  render(markdown: string): { html: string; css: string };
}

const SEPARATOR = /^---[ \t]*$/;

export function splitSlides(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  let start = 0;

  if (lines[0] !== undefined && SEPARATOR.test(lines[0])) {
    const closing = lines.findIndex((line, i) => i > 0 && SEPARATOR.test(line));
    if (closing !== -1) start = closing + 1;
  }

  const slides: string[] = [];
  let current: string[] = [];
  const frontMatter = start > 0 ? lines.slice(0, start) : [];

  for (let i = start; i < lines.length; i++) {
    if (SEPARATOR.test(lines[i])) {
      slides.push(current.join('\n'));
      current = [];
    } else {
      current.push(lines[i]);
    }
  }
  slides.push(current.join('\n'));

  if (frontMatter.length > 0 && slides.length > 0) {
    slides[0] = [...frontMatter, slides[0]].join('\n');
  }

  return slides;
}

export function renderDeck(markdown: string, marp?: MarpRenderer): MarpRenderResult {
  const renderer = marp ?? new Marp({ html: true });
  const { html, css } = renderer.render(markdown);
  return { html, css };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildStandaloneHtml(deck: MarpRenderResult, title = 'Marp Deck'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${deck.css}
</style>
</head>
<body>
${deck.html}
</body>
</html>`;
}

export function useMarpExport() {
  async function exportMarp(markdown: string, title = 'deck'): Promise<void> {
    const filePath = await save({
      filters: [{ name: 'HTML Deck', extensions: ['html'] }],
      defaultPath: `${title}.html`,
    });

    if (!filePath) return;

    const deck = renderDeck(markdown);
    await writeTextFile(filePath, buildStandaloneHtml(deck, title));
  }

  return { exportMarp };
}
