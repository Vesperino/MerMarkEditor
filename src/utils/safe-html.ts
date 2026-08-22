const SAFE_TAGS = new Set(['p', 'strong', 'em', 'br', 'a', 'img', 'details', 'summary']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math']);

const safeUrl = (value: string): boolean => {
  const normalized = value.trim().replace(/[\u0000-\u0020]+/g, '');
  const scheme = normalized.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  return !scheme || ['http', 'https', 'mailto'].includes(scheme);
};

export interface SafeHtmlTagToken {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  start: number;
  end: number;
}

/** Quote-aware tag tokenizer used by chunking, block mapping and NodeViews. */
export function safeHtmlTagTokens(raw: string): SafeHtmlTagToken[] {
  const tokens: SafeHtmlTagToken[] = [];
  let cursor = 0;
  while (cursor < raw.length) {
    const start = raw.indexOf('<', cursor);
    if (start < 0) break;
    if (raw.startsWith('<!--', start)) {
      const commentEnd = raw.indexOf('-->', start + 4);
      cursor = commentEnd < 0 ? raw.length : commentEnd + 3;
      continue;
    }
    let quote = '';
    let end = start + 1;
    for (; end < raw.length; end++) {
      const char = raw[end];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        break;
      }
    }
    if (end >= raw.length) break;
    const source = raw.slice(start, end + 1);
    const match = source.match(/^<\s*(\/?)\s*([a-z][\w-]*)\b/i);
    if (match) {
      tokens.push({
        name: match[2].toLowerCase(),
        closing: match[1] === '/',
        selfClosing: /\/\s*>$/.test(source),
        start,
        end: end + 1,
      });
    }
    cursor = end + 1;
  }
  return tokens;
}

/** Source lines for the allowlisted elements that survive sanitization. */
export function safeHtmlRenderableTagSourceLines(raw: string): number[] {
  const lines: number[] = [];
  const dropped: string[] = [];
  for (const token of safeHtmlTagTokens(raw)) {
    if (token.closing && DROP_WITH_CONTENT.has(token.name)) {
      const index = dropped.lastIndexOf(token.name);
      if (index >= 0) dropped.splice(index, 1);
      continue;
    }
    if (dropped.length > 0) continue;
    if (DROP_WITH_CONTENT.has(token.name)) {
      if (!token.selfClosing) dropped.push(token.name);
      continue;
    }
    if (!token.closing && SAFE_TAGS.has(token.name)) {
      lines.push(raw.slice(0, token.start).split('\n').length - 1);
    }
  }
  return lines;
}

export function safeHtmlInlineTagTokens(raw: string): SafeHtmlTagToken[] {
  const inline = new Set(['strong', 'em', 'br', 'a', 'img']);
  const result: SafeHtmlTagToken[] = [];
  const dropped: string[] = [];
  for (const token of safeHtmlTagTokens(raw)) {
    if (token.closing && DROP_WITH_CONTENT.has(token.name)) {
      const index = dropped.lastIndexOf(token.name);
      if (index >= 0) dropped.splice(index, 1);
      continue;
    }
    if (dropped.length > 0) continue;
    if (DROP_WITH_CONTENT.has(token.name)) {
      if (!token.selfClosing) dropped.push(token.name);
      continue;
    }
    if (inline.has(token.name)) result.push(token);
  }
  return result;
}

export function isStandaloneSafeHtmlBlock(raw: string): boolean {
  const parsed = new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html');
  const nodes = Array.from(parsed.body.childNodes).filter(node => node.nodeType !== Node.TEXT_NODE || node.textContent?.trim());
  if (nodes.length !== 1 || !(nodes[0] instanceof Element)) return false;
  const root = nodes[0];
  if (root.tagName.toLowerCase() === 'img') return true;
  if (root.tagName.toLowerCase() !== 'a') return false;
  const children = Array.from(root.childNodes).filter(node => node.nodeType !== Node.TEXT_NODE || node.textContent?.trim());
  return children.length === 1 && children[0] instanceof Element && children[0].tagName.toLowerCase() === 'img';
}

// encodeURIComponent intentionally leaves apostrophes untouched. Encode them
// as well so raw source is safe inside either HTML attribute quote style.
export const encodeSafeHtmlSource = (raw: string): string => encodeURIComponent(raw).replace(/'/g, '%27');

export const decodeSafeHtmlSource = (value: string): string => {
  try { return decodeURIComponent(value); } catch { return value; }
};

/** Compact stable identity for matching a raw block to its NodeView. */
export const safeHtmlSourceKey = (raw: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${raw.length}:${(hash >>> 0).toString(36)}`;
};

const copySafeAttributes = (source: Element, target: Element, tag: string) => {
  if (tag === 'p') {
    const align = source.getAttribute('align')?.toLowerCase();
    if (align && ['left', 'center', 'right', 'justify'].includes(align)) target.setAttribute('align', align);
  }
  if (tag === 'details' && source.hasAttribute('open')) target.setAttribute('open', '');
  if (tag === 'a') {
    const href = source.getAttribute('href');
    if (href && safeUrl(href)) target.setAttribute('href', href);
    const title = source.getAttribute('title');
    if (title) target.setAttribute('title', title);
  }
  if (tag === 'img') {
    const src = source.getAttribute('src');
    if (src && safeUrl(src)) {
      target.setAttribute('src', src);
      target.setAttribute('data-original-src', src);
    }
    for (const name of ['alt', 'title']) {
      const value = source.getAttribute(name);
      if (value) target.setAttribute(name, value);
    }
    for (const name of ['width', 'height']) {
      const value = source.getAttribute(name);
      if (value && /^\d{1,5}$/.test(value)) target.setAttribute(name, value);
    }
    target.classList.add('editor-image', 'safe-html-image');
  }
};

/** Render only the README-oriented HTML subset; executable/embedded content is discarded. */
export function sanitizeSafeHtml(raw: string): string {
  const parsed = new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html');
  const output = document.createElement('div');

  const append = (source: Node, parent: Node) => {
    if (source.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(source.textContent ?? ''));
      return;
    }
    if (!(source instanceof Element)) return;
    const tag = source.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) return;
    if (!SAFE_TAGS.has(tag)) {
      for (const child of Array.from(source.childNodes)) append(child, parent);
      return;
    }
    const clean = document.createElement(tag);
    copySafeAttributes(source, clean, tag);
    for (const child of Array.from(source.childNodes)) append(child, clean);
    parent.appendChild(clean);
  };

  for (const child of Array.from(parsed.body.childNodes)) append(child, output);
  return output.innerHTML;
}

export function isSafeInlineHtmlTag(raw: string): boolean {
  const tokens = safeHtmlTagTokens(raw);
  return tokens.length === 1
    && tokens[0].start === 0
    && tokens[0].end === raw.length
    && ['strong', 'em', 'br', 'a', 'img'].includes(tokens[0].name);
}

/** Sanitize one inline tag by using the same DOM allowlist as block rendering. */
export function sanitizeSafeInlineHtmlTag(raw: string): string {
  if (!isSafeInlineHtmlTag(raw)) return '';
  if (/^<\//.test(raw)) {
    const tag = raw.match(/^<\/([a-z]+)/i)?.[1]?.toLowerCase();
    return tag && ['strong', 'em', 'a'].includes(tag) ? `</${tag}>` : '';
  }
  const tag = raw.match(/^<([a-z]+)/i)?.[1]?.toLowerCase();
  if (!tag) return '';
  const wrapper = sanitizeSafeHtml(tag === 'br' || tag === 'img' ? raw : `${raw}</${tag}>`);
  if (tag === 'br' || tag === 'img') return wrapper;
  const opening = safeHtmlTagTokens(wrapper).find(token => !token.closing && token.name === tag);
  return opening ? wrapper.slice(opening.start, opening.end) : '';
}
