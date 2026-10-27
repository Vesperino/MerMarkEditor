import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { buildSaveDocument } from '../fixtures/markdown-save-documents';

const handbook = readFileSync('src/__tests__/fixtures/save-churn.md', 'utf8').replace(/\r\n?/g, '\n');

test('large visual saves preserve exact edit locality within a bounded budget', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  // No app/editor mounting in the timed region: measure the production save
  // serializer against its plain-serialization cost in the same browser.
  await page.goto('/');
  const measurements = [];
  for (const kind of ['handbook', 'wrapped', 'markers', 'repeated', 'html']) {
    for (const size of [100_000, 500_000]) {
      const source = buildSaveDocument(kind, size, handbook);
      const result = await page.evaluate(async ({ source, kind }) => {
        const converterUrl = '/src/utils/markdown-converter.ts';
        const serializerUrl = '/src/utils/source-preserving-markdown.ts';
        const { markdownToHtml, htmlToMarkdown } = await import(/* @vite-ignore */ converterUrl);
        const { sourcePreservingMarkdown } = await import(/* @vite-ignore */ serializerUrl);
        const html = markdownToHtml(source);
        // Editing an interior occurrence catches accidental reassignment among
        // repeated paragraphs. The marker goes inside text, never markup.
        const root = document.implementation.createHTMLDocument('').createElement('div');
        root.innerHTML = html;
        const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          if (!node.data.trim()) continue;
          if (kind === 'handbook' && node.parentElement?.matches('h1')) nodes.push(node);
          if ((kind === 'wrapped' || kind === 'repeated') && node.parentElement?.matches('p')) nodes.push(node);
          if (kind === 'markers' && node.data.includes('same') && node.parentElement?.closest('li')) nodes.push(node);
          if (kind === 'html' && node.parentElement?.matches('strong')) nodes.push(node);
        }
        const occurrence = Math.floor(nodes.length / 2);
        if (nodes.length === 0) throw new Error(`${kind}: no target in ${html.slice(0, 1000)}`);
        const node = nodes[occurrence];
        const pattern = {
          handbook: /Sample handbook/g,
          wrapped: /a b c d e/g,
          markers: /same(?=__)/g,
          repeated: /same(?:\n| )paragraph/g,
          html: /strong(?=<\/strong>)/g,
        }[kind]!;
        const editOffset = Array.from(source.matchAll(pattern))[occurrence].index + 1;
        const expected = source.slice(0, editOffset) + 'UNIQUE_EDIT' + source.slice(editOffset);
        const original = node.data;
        const textOffset = kind === 'markers' ? original.indexOf('same') + 1 : 1;
        node.data = original.slice(0, textOffset) + 'UNIQUE_EDIT' + original.slice(textOffset);
        const editedHtml = root.innerHTML;
        let start = performance.now();
        htmlToMarkdown(editedHtml);
        const plainMs = performance.now() - start;
        start = performance.now();
        const first = sourcePreservingMarkdown(editedHtml, source);
        const coldMs = performance.now() - start;
        start = performance.now();
        const unchanged = sourcePreservingMarkdown(editedHtml, first);
        const unchangedMs = performance.now() - start;
        node.data = node.data.replace('UNIQUE_EDIT', 'NEXT_EDIT');
        start = performance.now();
        const next = sourcePreservingMarkdown(root.innerHTML, first);
        const nextMs = performance.now() - start;
        return {
          plainMs, coldMs, nextMs, unchangedMs,
          // Assert every byte and the exact occurrence, ruling out a fast
          // fallback or an edit relocated to an equivalent repeated paragraph.
          preserved: first === expected,
          subsequentPreserved: next === first.replace('UNIQUE_EDIT', 'NEXT_EDIT'),
          unchanged: unchanged === first,
        };
      }, { source, kind });
      measurements.push({ kind, bytes: source.length, ...result });
      expect.soft(result.preserved, `${kind}/${size}: cold preservation`).toBe(true);
      expect.soft(result.subsequentPreserved, `${kind}/${size}: next preservation`).toBe(true);
      expect.soft(result.unchanged).toBe(true);
      // A hang guard, not a microbenchmark threshold: actual timings are
      // attached for same-machine comparisons rather than tight CI gates.
      expect.soft(result.coldMs, `${kind}/${size}: cold time`).toBeLessThan(2_000);
      expect.soft(result.nextMs, `${kind}/${size}: next time`).toBeLessThan(2_000);
    }
  }
  console.log(JSON.stringify(measurements, null, 2));
  await testInfo.attach('save-performance.json', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
});
