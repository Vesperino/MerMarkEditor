import { expect, test, type Page } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

const source = [
  '# Title', '',
  'First paragraph wraps', 'onto a second line.', '',
  '- item alpha', '- item beta', '',
  '| A | B |', '| --- | --- |', '| 1 | 2 |', '',
  '```js', 'const x = 1;', 'const y = 2;', '```', '',
  'Last paragraph starts', 'and ends here.',
].join('\n');

const highlightedLine = (page: Page) => page.locator('.code-editor .code-cursor-highlight-line');
// The view toggle ignores clicks while the previous switch is still restoring the cursor.
const switchTo = async (page: Page, name: 'Code' | 'Visual') => {
  const codeView = page.locator('.code-editor .cm-content');
  await expect(async () => {
    if (await codeView.isVisible() !== (name === 'Code')) {
      await page.getByRole('button', { name, exact: true }).click();
    }
    await (name === 'Code' ? expect(codeView).toBeVisible({ timeout: 500 }) : expect(codeView).toBeHidden({ timeout: 500 }));
  }).toPass();
  // The cursor restore runs ~150 ms after the switch; a click before it would be overwritten.
  if (name === 'Visual') await page.waitForTimeout(400);
};

test('Visual → Code highlights the source line of the clicked element', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mermark-settings', JSON.stringify({
    ai: { enabled: true, hasSeenFirstRun: true, panelSide: 'right' },
  })));
  await setupTauriMocks(page);
  await page.goto('/');
  const editor = page.locator('.editor-pane.active .tiptap');
  await expect(editor).toBeVisible();

  await switchTo(page, 'Code');
  await page.getByRole('textbox').fill(source);
  // Leave the code cursor at the end so a stale line would point at the last paragraph.
  await switchTo(page, 'Visual');

  const cases: Array<[string, string]> = [
    ['> p >> nth=0', 'First paragraph wraps'],
    ['li >> nth=1', '- item beta'],
    ['td >> nth=1', '| 1 | 2 |'],
    ['pre .hljs-number >> nth=1', 'const y = 2;'],
  ];
  for (const [selector, line] of cases) {
    await editor.locator(selector).click();
    if (selector === '> p >> nth=0') {
      // Explicitly place the caret in the first preserved source segment.
      await editor.locator(selector).evaluate(element => {
        const range = document.createRange();
        range.setStart(element.firstChild!, 2);
        range.collapse(true);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.waitForTimeout(80);
    }
    await switchTo(page, 'Code');
    await expect(highlightedLine(page)).toHaveText(line);
    await switchTo(page, 'Visual');
  }
});
