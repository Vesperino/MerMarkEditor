import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

const PATH = '/test/safe-links.md';
const MARKDOWN = [
  '<p align="center">',
  '  <a href="https://example.com/badge"><img src="/assets/logo.png" alt="Linked badge"></a>',
  '</p>',
  '',
  '<p><a href="https://example.com/text">Text link</a></p>',
  '',
  '<p align="center">',
  '  <strong>A modern, open-source Markdown editor with built-in Mermaid diagram support</strong>',
  '</p>',
].join('\n');

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
    await page.getByText('A modern, open-source Markdown editor', { exact: false }).click();
    await expect(page.locator('.safe-html-block').last()).toHaveAttribute('data-safe-html-cursor-line', '1');
    await page.getByRole('button', { name: 'Code', exact: true }).click();

    await expect.poll(() => page.evaluate(() => {
      const anchor = window.getSelection()?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      return element?.closest('.cm-line')?.textContent ?? '';
    })).toContain('<strong>A modern, open-source Markdown editor');
  });

  test('the HTML source line maps back to its rendered element in visual view', async ({ page }) => {
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    const strongLine = page.locator('.code-editor .cm-line').filter({ hasText: '<strong>A modern, open-source Markdown editor' });
    await strongLine.click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Visual', exact: true }).click();

    await expect(page.locator('.safe-html-block').last()).toHaveAttribute('data-safe-html-cursor-line', '1');
    const strong = page.getByText('A modern, open-source Markdown editor', { exact: false });
    await expect(strong).toBeVisible();
  });
});
