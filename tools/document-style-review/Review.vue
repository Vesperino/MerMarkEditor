<script setup lang="ts">
import { computed, ref } from 'vue';
import DocumentPreview from '../../src/components/DocumentPreview.vue';
import { DOCUMENT_STYLES, resolveDocumentStyle, type DocumentStyleId } from '../../src/styles/document-themes';
import { documentPrintCss } from '../../src/styles/document-themes/print';
import illustration from './public/demo-landscape.svg?inline';
import { mathPrintCss } from '../../src/utils/math-print';
import { serializeEditorContent } from '../../src/utils/documentSerializer';
import demo from './demo.md?raw';
const left = ref<DocumentStyleId>('github');
const right = ref<DocumentStyleId>('obsidian-minimal');
const native = ref(false);
const dark = ref(false);
const sync = ref(true);
const activeSide = ref(0);
const panes = ref<HTMLElement[]>([]);
const choices = computed(() => [left.value, right.value]);
const styles = computed(() => choices.value.map(id => {
  const style = resolveDocumentStyle(id, {}, dark.value ? 'dark' : 'light');
  return native.value ? { ...style, fontSize: style.nativeFontSize } : style;
}));
const sections = [ ['h1', 'Introduction'], ['h1:nth-of-type(2)', 'H1–H6'], ['#paragraph-rhythm', 'Paragraphs'], ['#lists-and-tasks', 'Lists'], ['#tables', 'Tables'], ['#code-and-technical-notes', 'Code'], ['#images-captions-and-mathematics', 'Media'], ['#mermaid-diagrams', 'Mermaid'] ];
function jump(selector: string) {
  for (const pane of panes.value) {
    const target = pane?.querySelector<HTMLElement>(selector);
    if (target) pane.scrollTop += target.getBoundingClientRect().top - pane.getBoundingClientRect().top - 16;
  }
}
function synchronize(index: number) {
  if (!sync.value || index !== activeSide.value) return;
  const source = panes.value[index]; const target = panes.value[1 - index];
  const blocks = Array.from(source.querySelectorAll<HTMLElement>('.tiptap > *'));
  const targetBlocks = Array.from(target.querySelectorAll<HTMLElement>('.tiptap > *'));
  const top = source.getBoundingClientRect().top;
  let i = blocks.findIndex(block => block.getBoundingClientRect().bottom > top);
  if (i < 0) i = blocks.length - 1;
  if (!blocks[i] || !targetBlocks[i]) return;
  const sourceBox = blocks[i].getBoundingClientRect();
  const fraction = (top - sourceBox.top) / Math.max(1, sourceBox.height);
  const targetBox = targetBlocks[i].getBoundingClientRect();
  target.scrollTop += targetBox.top - target.getBoundingClientRect().top + fraction * targetBox.height;
}
function downloadHtml(index: number) {
  const root = panes.value[index].querySelector<HTMLElement>('.ProseMirror');
  if (!root) return;
  const style = styles.value[index];
  const content = serializeEditorContent(root).replace(/src="demo-landscape.svg"/g, `src="${illustration}"`);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${style.label}</title><style>${documentPrintCss(style)} ${mathPrintCss} body{margin:0} article{max-width:680px;margin:24px auto;padding:24px}</style><article class="document-root" data-document-style="${style.id}">${content}</article></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a'); a.href = url; a.download = `${style.id}.html`; a.click(); URL.revokeObjectURL(url);
}
</script>
<template>
  <main class="review-tool">
    <header class="review-header">
      <div><h1>Document style review</h1><p>One document, seven reading styles. Compare the hierarchy and rhythm.</p></div>
      <div class="review-options"><label><input v-model="sync" type="checkbox"> Sync scrolling</label><label><input v-model="native" type="checkbox" data-testid="native-size"> Native font size</label><label><input v-model="dark" type="checkbox" data-testid="dark-mode"> Dark</label></div>
    </header>
    <nav aria-label="Demo sections"><button v-for="[selector, label] in sections" :key="label" @click="jump(selector)">{{ label }}</button></nav>
    <div class="review-columns">
      <section v-for="(style,index) in styles" :key="index" class="review-column">
        <div class="review-selector">
          <label :for="'style-' + index">{{ index === 0 ? 'Left style' : 'Right style' }}</label>
          <select :id="'style-' + index" :value="choices[index]" :data-testid="'style-' + index" @change="e => index === 0 ? left = (e.target as HTMLSelectElement).value as DocumentStyleId : right = (e.target as HTMLSelectElement).value as DocumentStyleId"><option v-for="choice in DOCUMENT_STYLES" :key="choice.id" :value="choice.id">{{ choice.label }}</option></select>
          <button @click="downloadHtml(index)">Export HTML</button>
          <a :href="style.source.reference" target="_blank" rel="noreferrer">Source ↗</a>
          <small>{{ style.fontSize }}px · {{ style.lineHeight.toFixed(2) }} line height</small>
        </div>
        <div :ref="el => panes[index] = el as HTMLElement" class="review-pane" :data-testid="'pane-' + index" tabindex="0" @wheel="activeSide = index" @pointerdown="activeSide = index" @focusin="activeSide = index" @scroll="synchronize(index)"><DocumentPreview :source="demo" :document-style="style" /></div>
      </section>
    </div>
  </main>
</template>
<style>
.review-tool { height: 100vh; background: #eef1f5; color: #273244; font: 14px system-ui,sans-serif; display: flex; flex-direction: column; }
.review-header { display: flex; justify-content: space-between; gap: 20px; padding: 18px 24px 12px; }
.review-header h1 { font-size: 22px; margin: 0 0 4px; }
.review-header p { margin: 0; color: #64748b; }
.review-options { display: flex; gap: 16px; align-items: center; }
.review-tool nav { display: flex; gap: 8px; padding: 0 24px 12px; }
.review-tool button, .review-tool select { font: inherit; background: white; color: #273244; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; }
.review-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 0 20px 20px; flex: 1; min-height: 0; }
.review-column { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.review-selector { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px; background: #f8fafc; border: 1px solid #d7dee8; border-radius: 10px 10px 0 0; }
.review-selector label { font-weight: 600; }
.review-selector small { margin-left: auto; color: #64748b; }
.review-pane { overflow: auto; background: white; flex: 1; min-height: 0; border: 1px solid #d7dee8; border-top: 0; border-radius: 0 0 10px 10px; }
@media(max-width:900px) { .review-header { flex-direction: column; } .review-columns { gap: 8px; padding: 0 8px 8px; } .review-selector small { display: none; } }
</style>
