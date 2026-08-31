import { expect, test, type Page } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

const DOC_PATH = '/test/ai-panel-layout.md';
const DOC_MARKDOWN = '# AI panel layout\n\nThe document should remain centred in the visible editor area.';

async function openDocument(page: Page, panelSide: 'left' | 'right' = 'right') {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript((side: 'left' | 'right') => {
    localStorage.setItem('mermark-settings', JSON.stringify({
      ai: { enabled: true, hasSeenFirstRun: true, panelSide: side },
    }));
  }, panelSide);
  await setupTauriMocks(page, {
    initialFs: { [DOC_PATH]: DOC_MARKDOWN },
    openFilePath: DOC_PATH,
  });

  await page.goto('/');
  await expect(page.locator('.editor-pane.active .editor-content-wrapper')).toBeVisible({ timeout: 10_000 });
}

async function openAiPanel(page: Page) {
  await page.getByRole('button', { name: 'Toggle AI assistant' }).first().click();
  await expect(page.locator('.ai-panel')).toBeVisible();
  await expect.poll(() => page.locator('.main-area').evaluate((element) => {
    const style = getComputedStyle(element);
    return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  })).toBeGreaterThan(0);
}

test.describe('AI panel layout', () => {
  test('centres the document in the editor space left visible by the right panel', async ({ page }) => {
    await openDocument(page);
    await openAiPanel(page);

    const geometry = await page.evaluate(() => {
      const editor = document.querySelector('.editor-pane.active .editor-container');
      const wrapper = document.querySelector('.editor-pane.active .editor-content-wrapper');
      const panel = document.querySelector('.ai-panel');
      if (!editor || !wrapper || !panel) throw new Error('Expected editor, document wrapper, and AI panel');

      const editorRect = editor.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        availableCenter: (editorRect.left + panelRect.left) / 2,
        wrapperCenter: (wrapperRect.left + wrapperRect.right) / 2,
        wrapperRight: wrapperRect.right,
        panelLeft: panelRect.left,
      };
    });

    expect(Math.abs(geometry.wrapperCenter - geometry.availableCenter)).toBeLessThanOrEqual(1);
    expect(geometry.wrapperRight).toBeLessThanOrEqual(geometry.panelLeft);
  });

  test('reserves space on the left when the panel is configured on the left', async ({ page }) => {
    await openDocument(page, 'left');
    await openAiPanel(page);

    const panelWidth = await page.locator('.ai-panel').evaluate(el => el.getBoundingClientRect().width);
    const padding = await page.locator('.main-area').evaluate(el => {
      const style = getComputedStyle(el);
      return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
    });

    expect(Math.abs(padding.left - panelWidth)).toBeLessThanOrEqual(1);
    expect(padding.right).toBe(0);
  });
});
