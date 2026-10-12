const CELL_STYLE = 'border:1px solid #a0a0a0;padding:4px 8px;vertical-align:top;';

/** Word and other rich-text targets ignore the editor stylesheet, so copied tables
 *  carry their borders inline (#160). */
export function withTableBorders(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const tables = template.content.querySelectorAll('table');
  if (!tables.length) return html;
  for (const table of tables) {
    table.setAttribute('border', '1');
    table.setAttribute('style', `border-collapse:collapse;${table.getAttribute('style') ?? ''}`);
    for (const cell of table.querySelectorAll('th, td')) {
      const header = cell.tagName === 'TH' ? 'background:#f2f2f2;font-weight:bold;' : '';
      cell.setAttribute('style', `${CELL_STYLE}${header}${cell.getAttribute('style') ?? ''}`);
    }
  }
  return template.innerHTML;
}

/** Runs after ProseMirror has filled the clipboard for this copy/cut event. */
export function addTableBordersToClipboard(event: ClipboardEvent): void {
  const data = event.clipboardData;
  const html = data?.getData('text/html');
  if (!data || !html || !/<table/i.test(html)) return;
  data.setData('text/html', withTableBorders(html));
}
