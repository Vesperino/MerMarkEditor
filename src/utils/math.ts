import katex from 'katex';
import { escapeHtml } from './html-entities';

export interface MathSource {
  start: number;
  end: number;
  formula: string;
  source: string;
  display: boolean;
}

const environments = /^(?:equation\*?|align\*?|alignat\*?|gather\*?|CD)$/;
const escaped = (text: string, at: number): boolean => {
  let count = 0;
  while (at > 0 && text[--at] === '\\') count++;
  return count % 2 === 1;
};

/** Scan source, never rendered HTML. Code, link destinations and escaped delimiters
 * are opaque. Keep the complete source so a visual edit does not rewrite syntax. */
export function findMath(text: string): MathSource[] {
  const found: MathSource[] = [];
  let i = 0;
  while (i < text.length) {
    const lineStart = i === 0 || text[i - 1] === '\n';
    if (lineStart) {
      const fence = /^( {0,3})(`{3,}|~{3,})([^\n]*)\n/.exec(text.slice(i));
      if (fence) {
        const marker = fence[2];
        const closeRe = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[ \\t]*(?=\\n|$)`, 'gm');
        closeRe.lastIndex = i + fence[0].length;
        const close = closeRe.exec(text);
        const end = close ? close.index + close[0].length : text.length;
        if (close && /^(math|latex|tex)$/i.test(fence[3].trim())) {
          found.push({ start: i, end, formula: text.slice(i + fence[0].length, close.index).replace(/\n$/, ''), source: text.slice(i, end), display: true });
        }
        i = end;
        continue;
      }
      // An indented code block cannot interrupt a paragraph.
      if (/^( {4}|\t)/.test(text.slice(i)) && (i === 0 || (text[i - 1] === '\n' && text[i - 2] === '\n'))) {
        const code = /^(?:(?: {4}|\t)[^\n]*(?:\n|$)|[ \t]*\n)+/.exec(text.slice(i));
        if (code) { i += code[0].length; continue; }
      }
    }
    if (text[i] === '`' && !escaped(text, i)) {
      const run = /^`+/.exec(text.slice(i))![0];
      const close = new RegExp(`(?<!\x60)\x60{${run.length}}(?!\x60)`, 'g');
      close.lastIndex = i + run.length;
      const match = close.exec(text);
      i = match ? match.index + run.length : i + run.length;
      continue;
    }
    if (text[i] === '<') {
      const html = /^(?:<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|<https?:[^>]*>)/.exec(text.slice(i));
      if (html) {
        const tag = /^<([a-zA-Z][\w-]*)\b/.exec(html[0])?.[1];
        // Raw HTML is handled by the safe-HTML extension; never put math tokens
        // inside its encoded source attributes (or inside pre/code examples).
        if (tag && !/^(img|br|hr|input|meta|link)$/i.test(tag)) {
          const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
          tags.lastIndex = i + html[0].length;
          let depth = 1;
          let match: RegExpExecArray | null;
          while ((match = tags.exec(text))) {
            depth += match[1] ? -1 : 1;
            if (!depth) break;
          }
          if (match) { i = match.index + match[0].length; continue; }
        }
        i += html[0].length; continue;
      }
    }
    if (text.startsWith('](', i)) {
      let depth = 1;
      i += 2;
      while (i < text.length && depth) {
        if (!escaped(text, i)) {
          if (text[i] === '(') depth++;
          if (text[i] === ')') depth--;
        }
        i++;
      }
      continue;
    }
    if (escaped(text, i)) { i++; continue; }
    let open = '';
    let close = '';
    let display = false;
    let environment = false;
    if (text.startsWith('$`', i)) { open = '$`'; close = '`$'; }
    else if (text.startsWith('$$', i)) { open = close = '$$'; display = true; }
    else if (text[i] === '$' && text[i - 1] !== '$' && !/\s/.test(text[i + 1] ?? ' ') && text[i + 1]) { open = close = '$'; }
    else if (text.startsWith('\\(', i)) { open = '\\('; close = '\\)'; }
    else if (text.startsWith('\\[', i)) { open = '\\['; close = '\\]'; display = true; }
    else if (text.startsWith('\\begin{', i)) {
      const begin = /^\\begin\{([^}]+)\}/.exec(text.slice(i));
      if (begin && environments.test(begin[1])) {
        open = begin[0]; close = `\\end{${begin[1]}}`; display = true; environment = true;
      }
    }
    if (!open) { i++; continue; }
    let end = text.indexOf(close, i + open.length);
    while (end >= 0 && (escaped(text, end) || (close === '$' && (text[end + 1] === '$' || /\s/.test(text[end - 1]))))) {
      end = text.indexOf(close, end + close.length);
    }
    if (end < 0) { i += open.length; continue; }
    const inner = text.slice(i + open.length, end);
    // Avoid interpreting currency prose ($5 and $10) as an equation.
    if ((!display && inner.includes('\n')) || !inner.trim() || (open === '$' && /\d/.test(text[end + 1] ?? ''))) {
      i += open.length; continue;
    }
    end += close.length;
    const source = text.slice(i, end);
    found.push({ start: i, end, formula: environment ? source : inner, source, display });
    i = end;
  }
  return found;
}

export function decodeMath(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function mathNodeHtml(math: Pick<MathSource, 'formula' | 'source' | 'display'>): string {
  const tag = math.display ? 'div' : 'span';
  const attr = (s: string) => escapeHtml(encodeURIComponent(s));
  return `<${tag} data-type="katex-${math.display ? 'block' : 'inline'}" data-formula="${attr(math.formula)}" data-math-source="${attr(math.source)}"></${tag}>`;
}

export function protectMath(text: string): { text: string; restore: (html: string) => string } {
  const matches = findMath(text);
  let cursor = 0;
  let result = '';
  const replacements = new Map<string, string>();
  // A document-specific prefix prevents authored text from colliding with tokens.
  let prefix = 'MERMATH';
  while (text.includes(prefix)) prefix += 'X';
  for (const [index, math] of matches.entries()) {
    const token = math.display ? `__${prefix}BLOCK${index}__` : `${prefix}INLINE${index}TOKEN`;
    replacements.set(token, mathNodeHtml(math));
    result += text.slice(cursor, math.start) + (math.display ? `\n${token}\n` : token);
    cursor = math.end;
  }
  result += text.slice(cursor);
  return { text: result, restore: html => html.replace(new RegExp(`__${prefix}BLOCK\\d+__|${prefix}INLINE\\d+TOKEN`, 'g'), token => replacements.get(token) ?? token) };
}

export function mathMarkdown(formula: string, source: string, display: boolean): string {
  if (source) {
    const parsed = findMath(source);
    if (parsed.length === 1 && parsed[0].start === 0 && parsed[0].end === source.length && parsed[0].formula === formula && parsed[0].display === display) return source;
  }
  return display ? `$$\n${formula}\n$$` : `$${formula}$`;
}

export function protectMathHtml(html: string, protect: (source: string) => string): string {
  if (!/data-type=["']katex-(?:block|inline)/.test(html)) return html;
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  root.querySelectorAll('[data-type="katex-block"], [data-type="katex-inline"]').forEach(el => {
    const display = el.getAttribute('data-type') === 'katex-block';
    const md = mathMarkdown(decodeMath(el.getAttribute('data-formula') ?? ''), decodeMath(el.getAttribute('data-math-source') ?? ''), display);
    el.replaceWith(document.createTextNode(protect(display ? `\n${md}\n` : md)));
  });
  return root.innerHTML;
}

/** Separate macros per equation: untrusted documents cannot redefine other formulas. */
export function renderMath(formula: string, display: boolean): { html: string; error: string | null } {
  try {
    return { html: katex.renderToString(formula, { displayMode: display, output: 'htmlAndMathml', throwOnError: true, trust: false, maxExpand: 1000, maxSize: 20, strict: 'ignore' }), error: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Invalid LaTeX';
    return { html: `<code class="math-error" title="${escapeHtml(error).replace(/"/g, '&quot;')}">${escapeHtml(formula)}</code>`, error };
  }
}

export function renderMathNodes(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-type="katex-block"], [data-type="katex-inline"]').forEach(el => {
    const display = el.dataset.type === 'katex-block';
    const formula = decodeMath(el.dataset.formula ?? '');
    el.className = display ? 'math-print-block' : 'math-print-inline';
    el.innerHTML = renderMath(formula, display).html;
    el.removeAttribute('contenteditable');
  });
}

/** Give Marp the same input syntaxes, while keeping its native math renderer. */
export function normalizeMathForMarp(text: string): string {
  const matches = findMath(text);
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const source = m.display ? `\n$$\n${m.formula.trim()}\n$$\n` : `$${m.formula.trim()}$`;
    text = text.slice(0, m.start) + source + text.slice(m.end);
  }
  return text;
}
