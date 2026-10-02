<script setup lang="ts">
import { computed } from 'vue';
import { markdownToHtml } from '../utils/markdown-converter';
import Editor from './Editor.vue';
import type { ResolvedDocumentStyle } from '../styles/document-themes';
const props = defineProps<{ source: string; documentStyle: ResolvedDocumentStyle }>();
const html = computed(() => markdownToHtml(props.source));
</script>
<template>
  <div class="document-preview" data-testid="document-preview">
    <Editor :model-value="html" :document-style="documentStyle" :editable="false" preview />
  </div>
</template>
<style>
.document-preview .editor-container { background: transparent; }
.document-preview .editor-content-wrapper { margin: 0 auto; }
.document-preview .editor-content { box-shadow: none; min-height: 0; }
.document-preview .editor-content-wrapper { flex: 0 0 auto; }
.document-preview-editor .mermaid-toolbar, .document-preview-editor .resize-handle { display: none; }
</style>
