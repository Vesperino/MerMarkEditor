import GithubSlugger, { slug } from 'github-slugger';

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

/**
 * Heading id slug, byte-compatible with GitHub's anchors.
 *
 * Delegates to `github-slugger` — the same implementation GitHub uses — so a
 * `[link](#anchor)` written against a GitHub-rendered document resolves here
 * too. Rolling this by hand is what caused the original bug: a `\s+` collapse
 * turned "Tier 0 — write-path correctness" into `tier-0-write-path-correctness`
 * where GitHub yields `tier-0--write-path-correctness` (the em dash is dropped
 * but both surrounding spaces survive as hyphens), and an ASCII-only character
 * class silently mangled non-Latin headings ("概要" produced an empty id).
 *
 * Stateless: duplicate headings get the same slug. For a whole document use
 * `createHeadingSlugger()` so collisions are numbered the way GitHub numbers
 * them.
 */
export function generateSlug(text: string): string {
  return slug(text);
}

/**
 * Per-document slugger. Feed it every heading in document order; repeats get
 * GitHub's `-1`, `-2`, … suffixes, and the counter re-checks each candidate so
 * a generated id can never collide with a literal heading that already claimed
 * it (`Foo`, `Foo 1`, `Foo` → `foo`, `foo-1`, `foo-2`).
 *
 * Always create a fresh one per conversion — a shared instance would leak
 * numbering between files and tabs.
 */
export function createHeadingSlugger(): GithubSlugger {
  return new GithubSlugger();
}
