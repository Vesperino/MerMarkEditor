import { expect, test } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

const source = ['Hello', '', 'This', 'Is', '', '', 'I test', '', '', 'Of the', '', 'MerMarkEditor'].join('\n');

// WebKit before Safari 26.4 (macOS WKWebView, #178) reports client rects with
// CSS zoom divided out. Reproduce that here so the check runs on any engine.
const emulateLegacyWebKitZoomRects = () => {
  const zoomOf = (node: Node | null) => {
    const el = node instanceof Element ? node : node?.parentElement;
    return (el as (Element & { currentCSSZoom?: number }) | null | undefined)?.currentCSSZoom ?? 1;
  };
  const unzoom = (r: DOMRect, z: number) => new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
  const patch = (proto: Element | Range, nodeOf: (self: never) => Node | null) => {
    const rect = proto.getBoundingClientRect;
    const rects = proto.getClientRects;
    proto.getBoundingClientRect = function (this: never) {
      return unzoom(rect.call(this), zoomOf(nodeOf(this)));
    };
    proto.getClientRects = function (this: never) {
      const z = zoomOf(nodeOf(this));
      return Array.from(rects.call(this), r => unzoom(r, z)) as unknown as DOMRectList;
    };
  };
  patch(Element.prototype, (el: Element) => el);
  patch(Range.prototype, (range: Range) => range.startContainer);
};

test('Code view clicks land on the clicked line at 150% zoom with legacy WebKit rects (#178)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mermark-settings', JSON.stringify({ ai: { enabled: true, hasSeenFirstRun: true, panelSide: 'right' } }));
    localStorage.setItem('mermark-editor-zoom', '150');
  });
  await page.addInitScript(emulateLegacyWebKitZoomRects);
  await setupTauriMocks(page);
  await page.goto('/');
  await expect(page.locator('.editor-pane.active .tiptap')).toBeVisible();
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(page.locator('.code-editor .cm-content')).toBeVisible();
  await page.getByRole('textbox').fill(source);
  await page.locator('.code-editor .cm-scroller').evaluate(el => { el.scrollTop = 0; });

  for (const text of ['Hello', 'This', 'I test', 'Of the']) {
    // The engine's own hit test gives the on-screen position, independent of the patched rects.
    const y = await page.evaluate((wanted) => {
      for (let y = 0; y < innerHeight; y += 2) {
        const line = document.elementFromPoint(innerWidth / 3, y)?.closest('.cm-line');
        if (line?.textContent === wanted) return y + 4;
      }
      return null;
    }, text);
    expect(y, `${text} is on screen`).not.toBeNull();
    await page.mouse.click(await page.evaluate(() => innerWidth / 3), y!);
    await expect.poll(() => page.evaluate(() => {
      const node = getSelection()?.focusNode;
      const el = node instanceof Element ? node : node?.parentElement;
      return el?.closest('.cm-line')?.textContent;
    })).toBe(text);
  }
});
