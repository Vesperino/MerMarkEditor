import { expect, test, type Page } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

const source = [
  '# Document title', '', '## Section heading', '', '### Smaller heading', '',
  '#### Fourth heading', '', '##### Fifth heading', '', '###### Sixth heading', '',
  'A paragraph with **bold text**, `inline code`, and [a link](https://example.com).', '',
  'A second paragraph that preserves its own spacing.', '',
  '> A block quote.', '', '- First list item', '- Second list item', '', '---', '',
  '| Column | Value |', '| --- | --- |', '| First | Content |', '',
  '```javascript', '// A comment', 'const count = 42;', '```',
].join('\n');

async function documentStyles(page: Page) {
  return page.locator('.editor-pane.active .editor-container').evaluate((container) => {
    const content = container.querySelector('.editor-content')!;
    const tiptap = container.querySelector('.tiptap')!;
    const origin = tiptap.getBoundingClientRect();
    const properties = [
      'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
      'color', 'background-color', 'margin-top', 'margin-bottom',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'border-top-width', 'border-top-color', 'border-bottom-width', 'border-bottom-color',
      'border-left-width', 'border-left-color', 'border-radius', 'box-shadow',
      'text-decoration-line', 'text-decoration-thickness', 'text-underline-offset',
    ];
    const styles = (element: Element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
    };
    return {
      container: styles(container),
      content: styles(content),
      tiptap: styles(tiptap),
      elements: Array.from(tiptap.querySelectorAll('*')).map((element) => {
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          styles: styles(element),
          // Chrome height can change, so compare positions within the document.
          x: box.x - origin.x,
          y: box.y - origin.y,
          width: box.width,
          height: box.height,
        };
      }),
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const font of ['system', 'georgia']) {
    test(`Appearance preserves document rendering and Editor settings in ${theme} mode with ${font} font`, async ({ page }) => {
      await page.addInitScript(({ mode, font }) => {
        if (localStorage.getItem('mermark-settings')) return;
        localStorage.setItem('mermark-settings', JSON.stringify({
          theme: mode,
          themeVariant: 'default',
          codeTheme: 'white',
          editorFontFamily: font,
          editorLineHeight: 2,
          editorPaddingTop: 30,
          editorPaddingBottom: 60,
          editorPaddingX: 48,
          ai: { enabled: true, hasSeenFirstRun: true, panelSide: 'right' },
        }));
      }, { mode: theme, font });
      await setupTauriMocks(page, {
        initialFs: { '/docs/appearance.md': source },
        openFilePath: '/docs/appearance.md',
      });
      await page.goto('/');
      await expect(page.locator('.editor-pane.active .tiptap h1')).toHaveText('Document title');

      const before = await documentStyles(page);
      const savedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('mermark-settings')!));
      expect(before.content['padding-left']).toBe('48px');
      expect(before.elements.find((element) => element.tag === 'P')!.styles['line-height']).toBe('32px');

      await page.locator('.settings-btn').click();
      await page.getByRole('button', { name: 'Appearance', exact: true }).click();
      await page.getByRole('button', { name: 'Minimal', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-variant', 'minimal');
      await page.getByRole('button', { name: 'Close', exact: true }).click();

      expect(await documentStyles(page)).toEqual(before);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mermark-settings')!).themeVariant)).toBe('minimal');
      const savedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('mermark-settings')!));
      expect(savedAfter).toMatchObject({ ...savedBefore, themeVariant: 'minimal' });

      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-variant', 'minimal');
      await expect(page.locator('.editor-pane.active .tiptap h1')).toHaveText('Document title');
      expect(await documentStyles(page)).toEqual(before);
    });
  }
}
