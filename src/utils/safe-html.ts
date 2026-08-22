const SAFE_TAGS = new Set(['p', 'strong', 'em', 'br', 'a', 'img', 'details', 'summary']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math']);

const safeUrl = (value: string): boolean => !/^\s*(?:javascript|vbscript|data):/i.test(value);

// encodeURIComponent intentionally leaves apostrophes untouched. Encode them
// as well so raw source is safe inside either HTML attribute quote style.
export const encodeSafeHtmlSource = (raw: string): string => encodeURIComponent(raw).replace(/'/g, '%27');

export const decodeSafeHtmlSource = (value: string): string => {
  try { return decodeURIComponent(value); } catch { return value; }
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
  return /^<\/?(?:strong|em|br|a|img)\b[^>]*>$/i.test(raw);
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
  return wrapper.match(new RegExp(`^<${tag}[^>]*>`))?.[0] ?? '';
}
