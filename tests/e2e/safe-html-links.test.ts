import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

const PATH = '/test/safe-links.md';
const MARKDOWN = [
  '<p align="center">',
  '  <a href="https://example.com/badge"><img src="/assets/logo.png" alt="Linked badge"></a>',
  '</p>',
  '',
  '<p><a href="https://example.com/text">Text link</a></p>',
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
});
