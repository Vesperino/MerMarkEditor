import { expect, test, type Page } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

async function openAiPanel(page: Page, installed: string, latest: string) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem('mermark-settings', JSON.stringify({
      ai: { enabled: true, hasSeenFirstRun: true, defaultCli: 'codex' },
    }));
  });
  await setupTauriMocks(page, {
    commands: {
      ai_health_check: { ok: true, version: installed, account: 'me', error: null, resolvedPath: null },
      ai_cli_latest_version: latest,
      ai_codex_models: [],
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle AI assistant' }).first().click();
  await expect(page.locator('.ai-panel')).toBeVisible();
}

test('the AI panel offers to update an outdated CLI', async ({ page }) => {
  await openAiPanel(page, 'codex-cli 0.144.6', '0.164.0');
  const notice = page.locator('.ai-panel .ai-cli-update');
  await expect(notice).toContainText('Version 0.164.0 is available');
  await expect(notice.getByRole('button', { name: 'Update' })).toBeEnabled();
});

test('the AI panel stays quiet when the CLI is current', async ({ page }) => {
  await openAiPanel(page, 'codex-cli 0.164.0', '0.164.0');
  await expect(page.locator('.ai-panel__select--model')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('.ai-panel .ai-cli-update')).toHaveCount(0);
});
