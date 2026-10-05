import { expect, test } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

for (const style of ['default', 'minimal']) {
  test(`source wrapping preserves paragraph boundaries and cursor restoration in ${style}`, async ({ page }) => {
    await page.addInitScript((themeVariant) => {
      localStorage.setItem('mermark-settings', JSON.stringify({
        themeVariant,
        editorLineHeight: 1.6,
        ai: { enabled: true, hasSeenFirstRun: true, panelSide: 'right' },
      }));
    }, style);
    await setupTauriMocks(page);
    await page.goto('/');
    await expect(page.locator('.editor-pane.active .tiptap')).toBeVisible();
    await page.getByRole('button', { name: 'Code', exact: true }).click();

    const source = [
      '## Wrapped prose',
      '',
      'First paragraph starts here',
      'and continues on another source line.',
      '',
      'Second paragraph starts here',
      'ends.',
      '',
      'Third paragraph has a hard break.  ',
      'This line remains in that paragraph.',
    ].join('\n');
    const code = page.getByRole('textbox');
    await expect(page.locator('.code-editor .code-cursor-highlight-line')).toBeVisible();
    await code.fill(source);
    await page.locator('.code-editor .cm-line').filter({ hasText: /^ends\.$/ }).click();
    await page.getByRole('button', { name: 'Visual', exact: true }).click();

    const paragraphs = page.locator('.editor-pane.active .tiptap > p');
    await expect(paragraphs).toHaveCount(3);
    await expect(paragraphs.nth(0)).toHaveText('First paragraph starts here and continues on another source line.');
    await expect(paragraphs.nth(1)).toHaveText('Second paragraph starts here ends.');
    await expect(paragraphs.nth(2).locator('br')).toHaveCount(1);
    // The short continuation requires source-block mapping, not text matching.
    const highlight = page.locator('.cursor-highlight');
    await expect(highlight).toBeVisible();
    const [highlightBox, targetBox] = await Promise.all([highlight.boundingBox(), paragraphs.nth(1).boundingBox()]);
    expect(Math.abs(highlightBox!.y - targetBox!.y)).toBeLessThan(10);

    const gap = await paragraphs.evaluateAll((elements) => (
      elements[1].getBoundingClientRect().top - elements[0].getBoundingClientRect().bottom
    ));
    expect(gap).toBeCloseTo(16, 1);
  });
}


test('prose spacing keeps lists and tables compact in Minimal', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mermark-settings', JSON.stringify({
    themeVariant: 'minimal',
    editorLineHeight: 1.6,
    ai: { enabled: true, hasSeenFirstRun: true, panelSide: 'right' },
  })));
  await setupTauriMocks(page, {
    initialFs: { '/docs/compact.md': 'First paragraph.\n\nSecond paragraph.\n\n- List item\n\n| Column |\n| --- |\n| Cell |' },
    openFilePath: '/docs/compact.md',
  });
  await page.goto('/');
  const editor = page.locator('.editor-pane.active .tiptap');
  await expect(editor.locator('> p').first()).toHaveCSS('margin-bottom', '16px');
  await expect(editor.locator('li p')).toHaveCSS('margin-bottom', '0px');
  for (const cell of await editor.locator('th p, td p').all()) {
    await expect(cell).toHaveCSS('margin-bottom', '0px');
  }
});
