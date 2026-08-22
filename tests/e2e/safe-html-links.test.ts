import { test, expect, type Page } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';
import { openCodeView, openVisualView } from './helpers/code-editor';

const PATH = '/test/safe-links.md';
const MARKDOWN = [
  '<p align="center">',
  '  <a href="https://example.com/badge"><img src="/assets/logo.png" alt="Linked badge"></a>',
  '</p>',
  '',
  '<p><a href="https://example.com/text">Text link</a></p>',
  '',
  '# Features',
  '',
  '- Fast visual editing',
  '- Mermaid diagrams',
  '',
  '<p align="center">',
  '  <strong>A modern, open-source Markdown editor with built-in Mermaid diagram support</strong>',
  '</p>',
  '',
  'Ordinary Markdown between repeated HTML blocks.',
  '',
  '<p align="center">',
  '  <strong>A modern, open-source Markdown editor with built-in Mermaid diagram support</strong>',
  '</p>',
  '',
  '## Installation',
  '',
  '```bash',
  'pnpm install',
  '```',
].join('\n');

const renderedDescription = (page: Page) => page
  .getByText('A modern, open-source Markdown editor', { exact: false });

const selectedCodeLine = (page: Page) => page.evaluate(() => {
  const anchor = window.getSelection()?.anchorNode;
  const element = anchor instanceof Element ? anchor : anchor?.parentElement;
  return element?.closest('.cm-line')?.textContent ?? '';
});

test.describe('safe HTML external links', () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriMocks(page, {
      initialFs: { [PATH]: MARKDOWN },
      openFilePath: PATH,
    });
    await page.goto('/');
    await expect(page.locator('.safe-html-block').first()).toBeVisible({ timeout: 10_000 });
  });

  test('linked badge uses the external-link confirmation instead of navigating WebView', async ({ page }) => {
    const initialUrl = page.url();
    await page.getByRole('img', { name: 'Linked badge' }).click();

    await expect(page.locator('.dialog-url')).toHaveText('https://example.com/badge');
    expect(page.url()).toBe(initialUrl);
  });

  test('text HTML link uses the same confirmation dialog', async ({ page }) => {
    const initialUrl = page.url();
    await page.getByRole('link', { name: 'Text link' }).click();

    await expect(page.locator('.dialog-url')).toHaveText('https://example.com/text');
    expect(page.url()).toBe(initialUrl);
  });

  test('clicking rendered HTML restores the matching source line in code view', async ({ page }) => {
    await renderedDescription(page).last().click();
    await expect(page.locator('.safe-html-block').last()).toHaveAttribute('data-safe-html-cursor-line', '1');
    await openCodeView(page);

    await expect.poll(() => selectedCodeLine(page)).toContain('<strong>A modern, open-source Markdown editor');

    const selectedTop = await page.evaluate(() => {
      const anchor = window.getSelection()?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      return element?.closest('.cm-line')?.getBoundingClientRect().top ?? -1;
    });
    const matchingLines = page.locator('.code-editor .cm-line').filter({ hasText: '<strong>A modern, open-source Markdown editor' });
    expect(Math.abs(selectedTop - (await matchingLines.nth(1).boundingBox())!.y)).toBeLessThan(3);
    await expect(matchingLines.nth(1)).toHaveClass(/code-cursor-highlight-line/);
    await expect.poll(() => matchingLines.nth(1).evaluate(element => (
      window.getComputedStyle(element).animationName
    ))).toContain('code-cursor-pulse');
    await expect(matchingLines.nth(0)).not.toHaveClass(/code-cursor-highlight-line/);
    await page.waitForTimeout(1000);
    await expect(matchingLines.nth(1)).toHaveClass(/code-cursor-highlight-line/);
    await page.waitForTimeout(500);
    await expect(matchingLines.nth(1)).not.toHaveClass(/code-cursor-highlight-line/);
  });

  test('a repeated HTML block keeps its exact line and highlight through a full view cycle', async ({ page }) => {
    await openCodeView(page);
    const strongLines = page.locator('.code-editor .cm-line').filter({ hasText: '<strong>A modern, open-source Markdown editor' });
    await expect(strongLines).toHaveCount(2);
    await strongLines.nth(1).click();
    await page.waitForTimeout(400);
    await openVisualView(page);

    await expect(page.locator('.safe-html-block').last()).toHaveAttribute('data-safe-html-cursor-line', '1');
    await expect(page.locator('.safe-html-block').nth(2)).toHaveAttribute('data-safe-html-cursor-line', '0');
    const secondStrong = renderedDescription(page).last();
    await expect(secondStrong).toBeVisible();
    const highlight = page.locator('.cursor-highlight');
    await expect(highlight).toBeVisible();
    const [highlightBox, targetBox] = await Promise.all([highlight.boundingBox(), secondStrong.boundingBox()]);
    expect(Math.abs(highlightBox!.y - targetBox!.y)).toBeLessThan(10);

    await page.waitForTimeout(400);
    await openCodeView(page);
    await expect.poll(() => selectedCodeLine(page)).toContain('<strong>A modern, open-source Markdown editor');
    const selectedTop = await page.evaluate(() => {
      const anchor = window.getSelection()?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      return element?.closest('.cm-line')?.getBoundingClientRect().top ?? -1;
    });
    const repeatedLines = page.locator('.code-editor .cm-line').filter({ hasText: '<strong>A modern, open-source Markdown editor' });
    expect(Math.abs(selectedTop - (await repeatedLines.nth(1).boundingBox())!.y)).toBeLessThan(3);
    await expect(repeatedLines.nth(1)).toHaveClass(/code-cursor-highlight-line/);
  });
});
