const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&rarr;': '→',
  '&larr;': '←',
  '&uarr;': '↑',
  '&darr;': '↓',
  '&harr;': '↔',
  '&mdash;': '—',
  '&ndash;': '–',
  '&bull;': '•',
  '&hellip;': '…',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
};

export function decodeHtmlEntities(text: string): string {
  let result = text;

  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.split(entity).join(char);
  }

  // Hex entities: &#x1F600;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16))
  );

  // Decimal entities: &#128512;
  result = result.replace(/&#(\d+);/g, (_, dec) =>
    String.fromCodePoint(parseInt(dec, 10))
  );

  return result;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
