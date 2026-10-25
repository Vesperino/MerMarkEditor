import pagedScriptUrl from '../../node_modules/pagedjs/dist/paged.min.js?url';

export type MarginBox = `${'top' | 'bottom'}-${'left' | 'center' | 'right'}`;
export type MarginText = (page: number, pages: number) => Partial<Record<MarginBox, string>>;

interface PagedWindow extends Window {
  PagedModule?: { Previewer: new () => { preview(): Promise<unknown> } };
}

const SCREEN_CSS = `
:root, :root body { background: #505050; }
.pagedjs_pages { display: flex; flex-direction: column; gap: 24px; width: max-content; padding: 24px; }
.pagedjs_page { background: #ffffff; box-shadow: 0 4px 32px rgba(0, 0, 0, 0.5); }`;

const FILLED_MARGIN_CSS = '.pagedjs_margin-content::after { content: none !important; }';

function loadPaged(win: PagedWindow): Promise<void> {
  if (win.PagedModule) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = win.document.createElement('script');
    script.src = pagedScriptUrl;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Paged.js failed to load'));
    win.document.head.append(script);
  });
}

/**
 * Lays `html` out into real pages with Paged.js, which polyfills `@page` margin
 * boxes for engines that ignore them (WebKit, #163). It runs in the frame's own
 * realm because Paged.js works on the global document. Margin boxes get their
 * text written in, so page numbers are plain text rather than CSS counters.
 */
export async function paginate(frame: HTMLIFrameElement, html: string, marginText: MarginText, firstPage = 1): Promise<HTMLElement[]> {
  const win = frame.contentWindow as PagedWindow | null;
  const doc = frame.contentDocument;
  if (!win || !doc) return [];
  doc.open();
  // Paged.js reads its source from this template, so the unpaginated document never renders.
  doc.write(html.replace(/<body>([\s\S]*)<\/body>/, '<body><template data-ref="pagedjs-content">$1</template></body>'));
  doc.close();
  doc.head.insertAdjacentHTML('beforeend', `<style media="screen">${SCREEN_CSS}</style>`);
  await loadPaged(win);
  await new win.PagedModule!.Previewer().preview();
  const pages = Array.from(doc.querySelectorAll<HTMLElement>('.pagedjs_page'));
  const last = firstPage + pages.length - 1;
  pages.forEach((page, i) => {
    for (const [box, text] of Object.entries(marginText(firstPage + i, last))) {
      const content = page.querySelector(`.pagedjs_margin-${box} > .pagedjs_margin-content`);
      if (content) content.textContent = text;
    }
  });
  doc.head.insertAdjacentHTML('beforeend', `<style data-pagedjs-ignore>${FILLED_MARGIN_CSS}</style>`);
  return pages;
}

/** Standalone HTML of a paginated frame, for a print window that cannot run Paged.js itself. */
export function serializePaged(doc: Document): string {
  doc.querySelectorAll('script, template[data-ref="pagedjs-content"]').forEach(el => el.remove());
  // Paged.js adds rules through the CSSOM, which outerHTML does not carry.
  doc.querySelectorAll('style').forEach(style => {
    if (style.sheet) style.textContent = Array.from(style.sheet.cssRules, rule => rule.cssText).join('\n');
  });
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}
