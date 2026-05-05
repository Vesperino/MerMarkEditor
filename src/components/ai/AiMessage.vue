<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AiMessage } from '../../composables/useAi';

const props = defineProps<{
  message: AiMessage;
  hasFence: boolean;
}>();

const emit = defineEmits<{
  linkClick: [url: string];
  showAttachment: [pins: NonNullable<AiMessage['attachments']>];
}>();

const isTool = computed(() => props.message.role === 'tool');
const isAttachment = computed(() => props.message.role === 'attachment');
const isAssistant = computed(() => props.message.role === 'assistant');

// Expand tool chip on click to reveal full args. Args arrive as a JSON
// string (see useAi.ts pushMessage for tool_request); pretty-print so the
// expanded view is readable.
const toolExpanded = ref(false);
const prettyToolArgs = computed(() => {
  if (!isTool.value || !props.message.text) return '';
  try {
    const parsed = JSON.parse(props.message.text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return props.message.text;
  }
});
// Show typing indicator while waiting for first text chunk.
const isThinking = computed(
  () => isAssistant.value && !props.message.done && props.message.text === '' && !props.message.error
);

// Strip mermark-replace / mermark-patch fence blocks from the visible bubble
// (defensive: if AI still returns a fence, strip it so the bubble stays clean).
const FENCE_RE = /```mermark-(replace|patch)\n[\s\S]*?```\s*/g;
const visibleText = computed(() => {
  const t = props.message.text;
  if (!props.hasFence) return t;
  return t.replace(FENCE_RE, '').trim();
});

// Tokenise the visible text into plain text segments and clickable links.
// Detects markdown links [label](url) and bare URLs (http/https).
type Segment = { kind: 'text' | 'link'; text: string; url?: string };
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const URL_RE = /\bhttps?:\/\/[^\s<>()\[\]"]+[^\s<>()\[\].,!?:;'"]/g;

const segments = computed<Segment[]>(() => {
  const text = visibleText.value;
  if (!text) return [];
  const out: Segment[] = [];
  // First pass: replace markdown links with placeholder tokens that we can
  // safely scan for bare URLs around without re-matching the embedded URL.
  type MdHit = { start: number; end: number; label: string; url: string };
  const mdHits: MdHit[] = [];
  let m: RegExpExecArray | null;
  MD_LINK_RE.lastIndex = 0;
  while ((m = MD_LINK_RE.exec(text)) !== null) {
    mdHits.push({ start: m.index, end: m.index + m[0].length, label: m[1], url: m[2] });
  }
  // Walk the text in order. For ranges between markdown hits, also extract
  // bare URLs.
  let cursor = 0;
  for (const hit of mdHits) {
    const between = text.slice(cursor, hit.start);
    pushTextWithBareUrls(out, between);
    out.push({ kind: 'link', text: hit.label, url: hit.url });
    cursor = hit.end;
  }
  pushTextWithBareUrls(out, text.slice(cursor));
  return out;
});

function pushTextWithBareUrls(out: Segment[], chunk: string) {
  if (!chunk) return;
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(chunk)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: chunk.slice(last, m.index) });
    out.push({ kind: 'link', text: m[0], url: m[0] });
    last = m.index + m[0].length;
  }
  if (last < chunk.length) out.push({ kind: 'text', text: chunk.slice(last) });
}

function onLink(url: string | undefined, e: MouseEvent) {
  if (!url) return;
  e.preventDefault();
  emit('linkClick', url);
}
</script>

<template>
  <div
    v-if="isTool"
    class="ai-msg ai-msg--tool"
    :class="{ 'ai-msg--tool-expanded': toolExpanded }"
  >
    <button
      class="ai-msg__tool-row"
      @click="toolExpanded = !toolExpanded"
      :title="toolExpanded ? 'Click to collapse' : 'Click to view full arguments'"
    >
      <svg class="ai-msg__tool-chevron" :class="{ 'ai-msg__tool-chevron--open': toolExpanded }" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      <span class="ai-msg__tool-label">{{ message.tool }}</span>
      <span v-if="!toolExpanded" class="ai-msg__tool-args">{{ message.text }}</span>
    </button>
    <pre v-if="toolExpanded" class="ai-msg__tool-args-full">{{ prettyToolArgs }}</pre>
  </div>
  <button
    v-else-if="isAttachment"
    class="ai-msg ai-msg--attachment"
    @click="emit('showAttachment', message.attachments ?? [])"
    :title="`Click to view ${(message.attachments ?? []).length} attached fragment(s)`"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
    <span class="ai-msg__att-label">Sent {{ (message.attachments ?? []).length }} attached fragment{{ (message.attachments ?? []).length === 1 ? '' : 's' }}</span>
    <span class="ai-msg__att-hint">click to view</span>
  </button>
  <div
    v-else
    class="ai-msg"
    :class="{
      'ai-msg--user': !isAssistant,
      'ai-msg--assistant': isAssistant,
      'ai-msg--err': !!message.error,
    }"
  >
    <div v-if="isThinking" class="ai-msg__thinking" aria-label="Thinking">
      <span class="ai-msg__thinking-dot" />
      <span class="ai-msg__thinking-dot" />
      <span class="ai-msg__thinking-dot" />
      <span class="ai-msg__thinking-text">Thinking…</span>
    </div>
    <pre v-else class="ai-msg__text"><template v-for="(seg, i) in segments" :key="i"><a
        v-if="seg.kind === 'link'"
        class="ai-msg__link"
        :href="seg.url"
        :title="seg.url"
        @click="onLink(seg.url, $event)"
      >{{ seg.text }}</a><template v-else>{{ seg.text }}</template></template></pre>
    <div v-if="message.error" class="ai-msg__error">{{ message.error }}</div>
  </div>
</template>

<style scoped>
.ai-msg {
  padding: 10px 14px;
  border-radius: 8px;
  max-width: 100%;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}
.ai-msg--user {
  background: var(--active-bg);
  color: var(--active-text);
  align-self: flex-end;
  max-width: 88%;
}
.ai-msg--assistant {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  align-self: flex-start;
  max-width: 92%;
  border: 1px solid var(--border-primary);
}
.ai-msg--err {
  background: var(--error-bg, rgba(239, 68, 68, 0.08));
  color: var(--error-color, #dc2626);
  border: 1px solid var(--error-border, rgba(239, 68, 68, 0.3));
}
.ai-msg__text {
  white-space: pre-wrap;
  margin: 0;
  font-family: inherit;
}
.ai-msg__link {
  color: var(--link-color, var(--primary));
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
  word-break: break-all;
}
.ai-msg__link:hover {
  color: var(--link-hover, var(--primary-hover, var(--primary)));
  text-decoration-thickness: 2px;
}
.ai-msg__error { font-size: 12px; margin-top: 6px; }

/* Typing indicator while waiting for first chunk */
.ai-msg__thinking {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ai-msg__thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: ai-msg-bounce 1.2s infinite ease-in-out both;
}
.ai-msg__thinking-dot:nth-child(1) { animation-delay: 0s; }
.ai-msg__thinking-dot:nth-child(2) { animation-delay: 0.15s; }
.ai-msg__thinking-dot:nth-child(3) { animation-delay: 0.3s; }
.ai-msg__thinking-text {
  margin-left: 4px;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
@keyframes ai-msg-bounce {
  0%, 80%, 100% { opacity: .3; transform: scale(0.7); }
  40% { opacity: 1; transform: scale(1); }
}

/* Tool usage entry */
.ai-msg--tool {
  display: flex;
  flex-direction: column;
  align-self: flex-start;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 11px;
  border-radius: 4px;
  border: 1px dashed var(--border-primary);
  font-family: var(--code-font-family, monospace);
  max-width: 100%;
  overflow: hidden;
}
.ai-msg--tool-expanded {
  align-self: stretch;
  width: 100%;
}
.ai-msg__tool-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  padding: 4px 8px;
  cursor: pointer;
  width: 100%;
  text-align: left;
}
.ai-msg__tool-row:hover { background: var(--hover-bg, rgba(0,0,0,0.04)); }
.ai-msg__tool-chevron {
  flex-shrink: 0;
  transition: transform 120ms ease;
  opacity: 0.6;
}
.ai-msg__tool-chevron--open { transform: rotate(90deg); }
.ai-msg__tool-label { font-weight: 600; color: var(--primary); }
.ai-msg__tool-args {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  opacity: 0.75;
}
.ai-msg__tool-args-full {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px dashed var(--border-primary);
  background: var(--bg-secondary, var(--bg-tertiary));
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}

/* Attachment marker — click to inspect what was sent */
.ai-msg--attachment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-end;
  background: var(--active-bg);
  color: var(--active-text);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px dashed var(--active-border, var(--primary));
  cursor: pointer;
  transition: filter 100ms ease;
  font-family: inherit;
}
.ai-msg--attachment:hover { filter: brightness(0.95); }
.ai-msg__att-label { font-weight: 600; }
.ai-msg__att-hint { opacity: 0.65; font-style: italic; }
</style>
