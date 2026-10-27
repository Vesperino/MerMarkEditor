import { expect, test, type Page } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';
import { fillCodeEditor, getCodeEditorValue, openCodeView, openVisualView, setCodeCursor } from './helpers/code-editor';

const path = '/test/source.md';
const source = '# Title\r\n\r\nfirst **bold** text\r\nsecond [linked](../README.md) words\r\n\r\nlast\r\n\r\n';
const lf = source.replace(/\r\n/g, '\n');

async function visualCaret(page: Page, text: string, offset: number) {
  await expect(page.locator('.ProseMirror')).toContainText(text);
  // Initial App loading deliberately suppresses dirty events for 200 ms.
  await page.waitForTimeout(250);
  await page.locator('.ProseMirror').evaluate((root, args) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const index = node.textContent?.indexOf(args.text) ?? -1;
      if (index < 0) continue;
      (root as HTMLElement).focus();
      const range = document.createRange();
      range.setStart(node, index + args.offset);
      range.collapse(true);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error('Visual target missing: ' + args.text);
  }, { text, offset });
  await page.waitForTimeout(80);
}

for (const mode of ['visual', 'code', 'split'] as const) {
  test(`${mode}: manual save and Save As retain CRLF, source wrapping, and EOF blank lines`, async ({ page }) => {
    const { getFs } = await setupTauriMocks(page, { initialFs: { [path]: source }, openFilePath: path });
    await page.goto('/');
    await expect(page.locator('.tab-bar .tab')).toContainText('source.md');
    if (mode === 'visual') {
      await visualCaret(page, 'last', 4);
      await page.keyboard.insertText('X');
    } else {
      if (mode === 'code') await openCodeView(page);
      else await page.locator('.split-editor-toggle-btn').click();
      await fillCodeEditor(page, lf.replace('last', 'lastX'));
    }
    const expected = source.replace('last', 'lastX');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => getFs()[path]).toBe(expected);
    await page.evaluate(() => { (window as any).__mockDialogSavePath = '/test/copy.md'; });
    await page.keyboard.press('ControlOrMeta+Shift+s');
    await expect.poll(() => getFs()['/test/copy.md']).toBe(expected);
    if (mode === 'code') {
      await page.waitForTimeout(300);
      await openVisualView(page);
      await page.waitForTimeout(450);
      await openCodeView(page);
      expect(await getCodeEditorValue(page)).toBe(lf.replace('last', 'lastX'));
    }
  });
}

for (const mode of ['code', 'split'] as const) {
  test(`${mode}: editing alone schedules autosave and preserves CRLF`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mermark-settings', JSON.stringify({
      ai: { hasSeenFirstRun: true }, autoSave: true,
    })));
    const { getFs } = await setupTauriMocks(page, { initialFs: { [path]: source }, openFilePath: path });
    await page.goto('/');
    await expect(page.locator('.tab-bar .tab')).toContainText('source.md');
    if (mode === 'code') await openCodeView(page);
    else await page.locator('.split-editor-toggle-btn').click();
    await fillCodeEditor(page, lf.replace('last', 'lastX'));
    await expect.poll(() => getFs()[path], { timeout: 9000 }).toBe(source.replace('last', 'lastX'));
  });

  test(`${mode}: window-close save uses raw source with the original line endings`, async ({ page }) => {
    const { getFs } = await setupTauriMocks(page, { initialFs: { [path]: source }, openFilePath: path });
    await page.goto('/');
    await expect(page.locator('.tab-bar .tab')).toContainText('source.md');
    if (mode === 'code') await openCodeView(page);
    else await page.locator('.split-editor-toggle-btn').click();
    await fillCodeEditor(page, lf.replace('last', 'lastX'));
    await page.evaluate(() => (window as any).__emitMockEvent('tauri://close-requested', null));
    await expect(page.locator('.dialog .btn-save')).toBeVisible();
    await page.locator('.dialog .btn-save').click();
    await expect.poll(() => getFs()[path]).toBe(source.replace('last', 'lastX'));
  });
}

for (const ending of ['\n', '\r\n', '\r']) {
  for (const target of [{ text: 'bold', offset: 2 }, { text: 'linked', offset: 2 }]) {
    test(`caret on ${target.text} survives visual/code cycles (${JSON.stringify(ending)})`, async ({ page }) => {
      const markdown = lf.replace(/\n/g, ending);
      await setupTauriMocks(page, { initialFs: { [path]: markdown }, openFilePath: path });
      await page.goto('/');
      await expect(page.locator('.ProseMirror')).toBeVisible();
      await visualCaret(page, target.text, target.offset);
      await openCodeView(page);
      const expectedOffset = lf.indexOf(target.text) + target.offset;
      const expectedLine = target.text === 'bold' ? 'first **bold** text' : 'second [linked](../README.md) words';
      await expect(page.locator('.code-cursor-highlight-line')).toHaveText(expectedLine);
      expect(await getCodeEditorValue(page)).toBe(lf);
      const actualOffset = await page.locator('.code-editor .cm-content').evaluate(root => {
        const selection = window.getSelection()!;
        const node = selection.anchorNode!;
        const element = node instanceof Element ? node : node.parentElement!;
        const line = element.closest('.cm-line')!;
        const range = document.createRange();
        range.setStart(line, 0);
        range.setEnd(node, selection.anchorOffset);
        let offset = range.toString().length;
        for (const previous of root.querySelectorAll('.cm-line')) {
          if (previous === line) break;
          offset += (previous.textContent?.length ?? 0) + 1;
        }
        return offset;
      });
      expect(actualOffset).toBe(expectedOffset);
      await setCodeCursor(page, expectedOffset);
      await page.waitForTimeout(300);
      await openVisualView(page);
      await page.waitForTimeout(450);
      const selected = await page.locator('.ProseMirror').evaluate(root => {
        const selection = window.getSelection();
        if (!selection?.anchorNode || !root.contains(selection.anchorNode)) return null;
        return { text: selection.anchorNode.textContent, offset: selection.anchorOffset };
      });
      expect(selected).toMatchObject({ text: target.text, offset: target.offset });
      await openCodeView(page);
      await expect(page.locator('.code-cursor-highlight-line')).toHaveText(expectedLine);
    });
  }
}

test('the production Editor preserves relative links and rejects script links', async ({ page }) => {
  const markdown = '[guide](../README.md) and [bad](javascript:alert)\n';
  await setupTauriMocks(page, { initialFs: { [path]: markdown }, openFilePath: path });
  await page.goto('/');
  await expect(page.locator('.ProseMirror a[href="../README.md"]')).toHaveText('guide');
  await expect(page.locator('.ProseMirror a[href^="javascript:"]')).toHaveCount(0);
});

for (const autosave of [false, true]) {
  test(`${autosave ? 'autosave' : 'manual save'} retains code edits made while a native write is pending`, async ({ page }) => {
    await page.addInitScript(autoSave => localStorage.setItem('mermark-settings', JSON.stringify({
      ai: { hasSeenFirstRun: true }, autoSave,
    })), autosave);
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let writing = false;
    let first = true;
    const { getFs } = await setupTauriMocks(page, {
      initialFs: { [path]: source }, openFilePath: path,
      beforeWrite: async () => {
        if (!first) return;
        first = false;
        writing = true;
        await blocked;
      },
    });
    await page.goto('/');
    await expect(page.locator('.tab-bar .tab')).toContainText('source.md');
    await openCodeView(page);
    await fillCodeEditor(page, lf.replace('last', 'lastX'));
    if (!autosave) await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => writing, { timeout: 9000 }).toBe(true);
    await fillCodeEditor(page, lf.replace('last', 'lastXY'));
    release();
    await expect.poll(() => getFs()[path]).toBe(source.replace('last', 'lastX'));
    await expect(page.locator('.tab.active .tab-unsaved')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => getFs()[path]).toBe(source.replace('last', 'lastXY'));
    await expect(page.locator('.tab.active .tab-unsaved')).toHaveCount(0);
  });
}
