import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '../../utils/markdown-converter';
import { sourceBoundaries } from '../../utils/markdown-source-alignment';

function buildLargeDoc(): string {
  const chunk = [
    '# Section header',
    '',
    'A paragraph with **bold**, *italic*, `code` and a [link](https://example.com).',
    '',
    '- list item one',
    '  continuation line under the item',
    '- list item two',
    '  more continuation',
    '',
    '    indented code candidate line 1',
    '    indented code candidate line 2',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '| a | b |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
  ].join('\n');
  let doc = '';
  while (doc.length < 2_000_000) doc += chunk;
  return doc;
}

describe('markdownToHtml performance', () => {
  it.each(['<strong ', '<!-- unclosed '])('bounds alignment scanning for repeated malformed syntax %j', (opener) => {
    const source = opener.repeat(20_000);
    const start = performance.now();
    // Exhausting the cooperative budget may return null; neither path may
    // spend quadratic time repeatedly searching for an absent closing token.
    const result = sourceBoundaries(source, source);
    expect(performance.now() - start).toBeLessThan(2_000);
    if (result) expect(result.right[source.length]).toBe(source.length);
  });

  it('converts a ~2MB document in bounded time (issue #129 hang guard)', () => {
    const doc = buildLargeDoc();
    const start = performance.now();
    const html = markdownToHtml(doc);
    const elapsed = performance.now() - start;
    expect(html.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(10_000);
  }, 30_000);
});
