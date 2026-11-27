import { expect, test, type Page } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

// Inline images split one Markdown paragraph into several editor blocks, a
// four-backtick fence nests a three-backtick one, and the Alpha/Beta sections
// repeat the same text: each of these used to shift or misplace the cursor.
const source = [
  '# Title', '',
  '![red](img/red.png) [open blue](img/blue.png)', '',
  'intro ![mid](img/red.png) outro words', '',
  '````markdown', '```mermaid', 'graph TD; A-->B;', '```', '````', '',
  '$$', 'x^2', '$$', '',
  '## Alpha', '',
  'Repeated words stay **bold** and *italic* here.', '',
  '- item one', '- item two', '  - nested deep', '- item three', '',
  '| Name | Value |', '| --- | --- |', '| first | second cell |', '',
  '```js', 'const x = 1;', 'const y = 2;', '```', '',
  '## Beta', '',
  'Repeated words stay **bold** and *italic* here.', '',
  '- item one', '- item two', '',
  'Last paragraph ends here.',
].join('\n');

const switchTo = async (page: Page, name: 'Code' | 'Visual') => {
  const codeView = page.locator('.code-editor .cm-content');
  await expect(async () => {
    if (await codeView.isVisible() !== (name === 'Code')) {
      await page.getByRole('button', { name, exact: true }).click();
    }
    await (name === 'Code' ? expect(codeView).toBeVisible({ timeout: 500 }) : expect(codeView).toBeHidden({ timeout: 500 }));
  }).toPass();
  await page.waitForTimeout(400);
};

const codeSelection = (page: Page) => page.evaluate(() => {
  let c = (document.querySelector('.cm-editor')?.parentElement as any)?.__vueParentComponent;
  while (c && !c.exposed?.editor) c = c.parent;
  const editor = c.exposed.editor;
  const { start, end } = editor.getSelection();
  const value: string = editor.getValue();
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', start);
  return { text: value.slice(start, end), start, line: value.slice(lineStart, lineEnd < 0 ? undefined : lineEnd) };
});

const selectInCode = (page: Page, anchor: string, target: string) => page.evaluate(({ anchor, target }) => {
  let c = (document.querySelector('.cm-editor')?.parentElement as any)?.__vueParentComponent;
  while (c && !c.exposed?.editor) c = c.parent;
  const editor = c.exposed.editor;
  const value: string = editor.getValue();
  const from = value.indexOf(target, value.indexOf(anchor));
  editor.focus();
  editor.setSelection(from, from + target.length);
}, { anchor, target });

const visualSelection = (page: Page) => page.locator('.editor-pane.active .tiptap').evaluate((el: any) => {
  const { state } = el.editor;
  const { from, to } = state.selection;
  return { text: state.doc.textBetween(from, to, '\n'), before: state.doc.textBetween(0, from, '\n') };
});

const selectInVisual = (page: Page, anchor: string, target: string) => page.locator('.editor-pane.active .tiptap').evaluate((el: any, { anchor, target }) => {
  const editor = el.editor;
  let started = !anchor;
  let from = -1;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (from >= 0 || !node.isText) return;
    let start = 0;
    if (!started) {
      const at = node.text.indexOf(anchor);
      if (at < 0) return;
      started = true;
      start = at;
    }
    const at = node.text.indexOf(target, start);
    if (at >= 0) from = pos + at;
  });
  editor.chain().focus().setTextSelection({ from, to: from + target.length }).run();
}, { anchor, target });

const open = async (page: Page) => {
  await setupTauriMocks(page);
  await page.goto('/');
  await expect(page.locator('.editor-pane.active .tiptap')).toBeVisible();
  await switchTo(page, 'Code');
  await page.getByRole('textbox').fill(source);
  await switchTo(page, 'Visual');
};

test('Visual → Code keeps the selected text and its place', async ({ page }) => {
  await open(page);
  const cases: Array<{ anchor: string; target: string; line: string; after?: string }> = [
    { anchor: '', target: 'outro', line: 'intro ![mid](img/red.png) outro words' },
    { anchor: '', target: 'Alpha', line: '## Alpha' },
    { anchor: 'Beta', target: 'italic', line: 'Repeated words stay **bold** and *italic* here.', after: '## Beta' },
    { anchor: 'Alpha', target: 'deep', line: '  - nested deep' },
    { anchor: 'Beta', target: 'two', line: '- item two', after: '## Beta' },
    { anchor: '', target: 'second', line: '| first | second cell |' },
    { anchor: '', target: 'const y', line: 'const y = 2;' },
    { anchor: '', target: 'ends', line: 'Last paragraph ends here.' },
  ];
  for (const { anchor, target, line, after } of cases) {
    await selectInVisual(page, anchor, target);
    await switchTo(page, 'Code');
    const selection = await codeSelection(page);
    expect(selection, `${target} in "${line}"`).toMatchObject({ text: target, line });
    if (after) expect(selection.start).toBeGreaterThan(source.indexOf(after));
    await switchTo(page, 'Visual');
  }
});

test('Code → Visual keeps the selected text and its place', async ({ page }) => {
  await open(page);
  const cases: Array<{ anchor: string; target: string; after?: string }> = [
    { anchor: '', target: 'outro' },
    { anchor: '## Alpha', target: 'Alpha' },
    { anchor: '## Beta', target: 'italic', after: 'Beta' },
    { anchor: '', target: 'deep' },
    { anchor: '## Beta', target: 'two', after: 'Beta' },
    { anchor: '', target: 'second' },
    { anchor: '', target: 'y = 2' },
    { anchor: '', target: 'ends' },
  ];
  for (const { anchor, target, after } of cases) {
    await switchTo(page, 'Code');
    await selectInCode(page, anchor, target);
    await switchTo(page, 'Visual');
    const selection = await visualSelection(page);
    expect(selection.text, target).toBe(target);
    if (after) expect(selection.before).toContain(after);
  }
});
