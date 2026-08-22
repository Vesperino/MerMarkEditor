import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

/**
 * Syntax highlighting is intentionally capped. Parsing multi-megabyte files
 * synchronously would make code view reproduce the large-file hang from #129.
 */
export const CODE_HIGHLIGHT_CHAR_THRESHOLD = 250_000;

interface HighlightNode {
  type: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HighlightNode[];
}

export interface MarkdownHighlightResult {
  html: string;
  highlighted: boolean;
}

export function escapeHighlightText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderNode(node: HighlightNode): string {
  if (node.type === 'text') return escapeHighlightText(node.value ?? '');

  const children = (node.children ?? []).map(renderNode).join('');
  if (node.type !== 'element') return children;

  // Lowlight emits spans. Rebuild only those spans and only its known class
  // namespace instead of injecting arbitrary AST properties into the DOM.
  const rawClasses = node.properties?.className;
  const classes = (Array.isArray(rawClasses) ? rawClasses : [rawClasses])
    .filter((value): value is string => typeof value === 'string' && /^hljs-[\w-]+$/.test(value));

  return classes.length > 0
    ? `<span class="${classes.join(' ')}">${children}</span>`
    : children;
}

export function highlightMarkdown(value: string): MarkdownHighlightResult {
  if (value.length > CODE_HIGHLIGHT_CHAR_THRESHOLD) {
    return { html: escapeHighlightText(value), highlighted: false };
  }

  const tree = lowlight.highlight('markdown', value) as HighlightNode;
  return {
    html: (tree.children ?? []).map(renderNode).join(''),
    highlighted: true,
  };
}
