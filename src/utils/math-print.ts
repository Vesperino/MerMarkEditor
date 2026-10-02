import css from 'katex/dist/katex.min.css?raw';

// Inline fonts into print HTML: no CDN, file URL, or app origin is required.
const fonts = import.meta.glob<string>('../../node_modules/katex/dist/fonts/*.woff2', {
  eager: true, query: '?inline', import: 'default',
});
export const mathPrintCss = css.replace(/src:[^;}]+/g, declaration => {
  const name = /url\([^)]*?(KaTeX_[^/)]+\.woff2)\)/.exec(declaration)?.[1];
  const url = name ? fonts[`../../node_modules/katex/dist/fonts/${name}`] : undefined;
  return url ? `src:url("${url}") format("woff2")` : declaration;
}) + '\n.math-print-block { display:block; overflow-x:auto; break-inside:avoid; margin:.6em 0; } p:has(+ .math-print-block) { break-after:avoid; } .math-print-block .katex-display { margin:.25em 0; } .math-print-inline { display:inline; } .math-error { white-space:pre-wrap; color:#b91c1c; }'
  // Paper cannot scroll: wrap long equations and keep numbers clear of the content.
  + ' .math-print-block .katex-display>.katex, .math-print-block .katex-html { white-space:normal; } .math-print-block .katex-display>.katex>.katex-html:has(>.katex-tag) { padding:0 3em; } .math-print-block .katex-display>.katex>.katex-html:has(>.katex-base>.mtable) { white-space:nowrap; display:inline-block; min-width:100%; box-sizing:border-box; }';
