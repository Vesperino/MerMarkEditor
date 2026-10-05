/**
 * Clipboard checks for the table paste shortcut (#155).
 *
 * Chat apps put whole answers on the clipboard with tables in between prose
 * and code. Only a clipboard that holds nothing but one table may take the
 * shortcut; everything else goes through the regular paste.
 */

const NON_CONTENT = 'style, script, meta, title, link';

export function isTableOnlyHtml(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (doc.body.querySelectorAll('table').length !== 1) return false;
  const rest = doc.body.cloneNode(true) as HTMLElement;
  rest.querySelectorAll(`table, ${NON_CONTENT}`).forEach((el) => el.remove());
  return !rest.textContent?.trim() && !rest.querySelector('img');
}

export function isTableOnlyText(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return false;
  return lines.every((line) => line.includes('\t'))
    || lines.every((line) => /^\s*\|.*\|\s*$/.test(line));
}
