<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { Marp } from '@marp-team/marp-core';
import { renderDeck } from '../composables/useMarpExport';

const props = defineProps<{ markdown: string }>();

// Live preview renders into the app document (Shadow DOM), so raw HTML in the
// deck is disabled here — an inline handler (e.g. <img onerror>) in an opened
// deck would otherwise run in the app context. Present/export keep html:true
// because they render inside a sandboxed iframe.
const safeMarp = new Marp({ html: false });

const host = ref<HTMLElement | null>(null);
let shadow: ShadowRoot | null = null;

function render() {
  if (!shadow) return;
  let body = '';
  let css = '';
  try {
    const deck = renderDeck(props.markdown || '', safeMarp);
    body = deck.html;
    css = deck.css;
  } catch {
    body = '<p style="padding:16px;color:#a33">Nie udało się wyrenderować slajdów.</p>';
  }
  // Marp renders each slide as a block <svg>; stack them with spacing and make
  // them responsive to the pane width. The deck CSS (incl. any author `style:`
  // directive) lives inside this Shadow DOM, so it is encapsulated — at worst it
  // restyles this preview pane, it cannot reach the app document.
  shadow.innerHTML = `<style>
    :host, * { box-sizing: border-box; }
    .deck { padding: 16px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
    .deck svg[data-marpit-svg], .deck > svg { width: 100%; height: auto; max-width: 960px;
      box-shadow: 0 2px 12px rgba(0,0,0,.25); border-radius: 6px; }
    ${css}
  </style><div class="deck">${body}</div>`;
}

onMounted(() => {
  if (host.value) {
    shadow = host.value.attachShadow({ mode: 'open' });
    render();
  }
});

watch(() => props.markdown, render);

defineExpose({ scrollEl: host });
</script>

<template>
  <div ref="host" class="marp-live"></div>
</template>

<style scoped>
.marp-live {
  height: 100%;
  overflow-y: auto;
  background: var(--bg-secondary, #15151c);
}
</style>
