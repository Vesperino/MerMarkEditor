// Line-based get/set for the scalar keys a Marp deck's front matter uses
// (theme, paginate, size, header, footer, backgroundColor, color). Operates on
// the inner text between the `---` fences. Deliberately not a full YAML parser:
// ponytail — Marp directives are flat `key: value` scalars.

function escapeKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getFrontmatterKey(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`^[ \\t]*${escapeKey(key)}[ \\t]*:[ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

export function removeFrontmatterKey(raw: string, key: string): string {
  const re = new RegExp(`^[ \\t]*${escapeKey(key)}[ \\t]*:`);
  return raw.split('\n').filter((line) => !re.test(line)).join('\n');
}

export function setFrontmatterKey(raw: string, key: string, value: string): string {
  const re = new RegExp(`^([ \\t]*${escapeKey(key)}[ \\t]*:[ \\t]*).*$`, 'm');
  // Replacement via callback so `$` in `value` is inserted literally, not as a
  // regex replacement token.
  if (re.test(raw)) return raw.replace(re, (_, prefix) => `${prefix}${value}`);
  const trimmed = raw.replace(/\s+$/, '');
  return trimmed.length ? `${trimmed}\n${key}: ${value}` : `${key}: ${value}`;
}
