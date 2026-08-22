import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

test.skip(process.env.RELEASE_SCREENSHOTS !== '1', 'Run explicitly to refresh release screenshots');

const DEMO_PATH = '/release/whats-new.md';
const DEMO_MARKDOWN = [
  '<p align="center">',
  '  <img src="/assets/mermark-banner.jpeg" alt="MerMark Editor" width="600">',
  '</p>',
  '',
  '<p align="center">',
  '  <strong>A fast, visual Markdown editor with full code control</strong><br>',
  '  <a href="https://github.com/Vesperino/MerMarkEditor"><img src="https://img.shields.io/badge/MerMark-Open_Source-35c7bd" alt="MerMark"></a>',
  '</p>',
  '',
  '<details open>',
  "  <summary>What's new in this release?</summary>",
  '  <p>Large documents stay responsive, code view highlights Markdown syntax, and common README HTML renders visually.</p>',
  '</details>',
  '',
  '# Markdown syntax highlighting',
  '',
  '- **Bold text**, *emphasis* and `inline code`',
  '- [Links](https://example.com) and images keep their structure',
  '',
  '> Edit visually or switch to code without losing content.',
  '',
  '```ts',
  'const documentSize = 3 * 1024 * 1024;',
  "const mode = documentSize > 1_000_000 ? 'lazy-visual' : 'visual';",
  '```',
].join('\n');

test('capture syntax highlighting and safe HTML rendering', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mermark-settings', JSON.stringify({
      theme: 'dark',
      codeTheme: 'dark',
      themeVariant: 'default',
      workspace: {
        openWorkspaces: [],
        activeWorkspaceId: null,
        recentRoots: [],
        sidebarVisible: false,
      },
      ai: { hasSeenFirstRun: true },
    }));
  });
  await setupTauriMocks(page, {
    initialFs: { [DEMO_PATH]: DEMO_MARKDOWN },
    openFilePath: DEMO_PATH,
    version: '0.6.6',
  });

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.safe-html-block').first()).toBeVisible({ timeout: 10_000 });
  await page.addStyleTag({ content: '.workspace-sidebar { display: none !important; }' });
  await page.screenshot({
    path: 'assets/screenshots/readme-html-rendering.png',
    animations: 'disabled',
  });

  await page.keyboard.press('Control+Shift+V');
  await expect(page.locator('.code-highlight')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({
    path: 'assets/screenshots/markdown-syntax-highlighting.png',
    animations: 'disabled',
  });
});
