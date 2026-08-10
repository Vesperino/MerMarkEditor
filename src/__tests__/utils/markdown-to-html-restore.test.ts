import { describe, it, expect } from 'vitest';
import { restoreCodeBlocks } from '../../utils/markdown-to-html';

describe('restoreCodeBlocks', () => {
  it('restores code and mermaid placeholders by index', () => {
    const blocks = ['<pre>a</pre>', '<div data-type="mermaid"></div>'];
    const html = 'x __CODE_BLOCK_0__ y __MERMAID_BLOCK_1__ z';
    expect(restoreCodeBlocks(html, blocks)).toBe(
      'x <pre>a</pre> y <div data-type="mermaid"></div> z',
    );
  });

  it('restores hundreds of blocks in one pass', () => {
    const blocks = Array.from({ length: 300 }, (_, i) => `<pre>${i}</pre>`);
    const html = blocks.map((_, i) => `__CODE_BLOCK_${i}__`).join('\n');
    const out = restoreCodeBlocks(html, blocks);
    expect(out.startsWith('<pre>0</pre>')).toBe(true);
    expect(out.endsWith('<pre>299</pre>')).toBe(true);
  });

  it('leaves placeholders without a stored block untouched', () => {
    expect(restoreCodeBlocks('__CODE_BLOCK_7__', [])).toBe('__CODE_BLOCK_7__');
  });
});
