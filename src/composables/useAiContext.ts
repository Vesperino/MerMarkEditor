import { ref, computed } from 'vue';
import type { CliKind } from '../services/aiCommands';

export interface ContextUsage {
  /** Total input-side tokens consumed in the latest turn. */
  inputTokens: number;
  /** Cache creation tokens (counted as input). */
  cacheCreationTokens: number;
  /** Cache read tokens (counted as input). */
  cacheReadTokens: number;
  /** Output tokens generated in the latest turn. */
  outputTokens: number;
  /** Total context bytes used (sum of input-side fields). */
  totalInputTokens: number;
  /** Maximum context window for the active model. */
  contextWindow: number;
  /** Percentage of the context window used (0..1). */
  fraction: number;
  /** True if no usage has been recorded yet. */
  empty: boolean;
  /** Free / unused space in the window. */
  freeTokens: number;
  /** Reserved category-style breakdown (claude /context-like). */
  breakdown: Array<{ key: string; label: string; tokens: number; pct: number; color: string }>;
}

const DEFAULT_CONTEXT_WINDOW: Record<CliKind, number> = {
  claude: 200_000,
  codex: 256_000,
};

const usage = ref<ContextUsage>(emptyUsage('claude'));

function emptyUsage(cli: CliKind): ContextUsage {
  const cw = DEFAULT_CONTEXT_WINDOW[cli];
  return {
    inputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    totalInputTokens: 0,
    contextWindow: cw,
    fraction: 0,
    empty: true,
    freeTokens: cw,
    breakdown: [],
  };
}

/**
 * Parse the `usage` payload that comes with a Done chunk, plus the optional
 * `modelUsage` block that some CLIs (claude) emit alongside, into a uniform
 * ContextUsage. Both arguments may be unknown shapes; defensive get() helpers
 * shield us from crashes on schema drift.
 */
export function parseUsage(cli: CliKind, raw: unknown): ContextUsage {
  if (!raw || typeof raw !== 'object') return emptyUsage(cli);
  const r = raw as Record<string, unknown>;

  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

  const inputTokens = num(r.input_tokens) || num(r.inputTokens);
  const cacheCreationTokens = num(r.cache_creation_input_tokens) || num(r.cacheCreationInputTokens);
  const cacheReadTokens = num(r.cache_read_input_tokens) || num(r.cacheReadInputTokens);
  const outputTokens = num(r.output_tokens) || num(r.outputTokens);
  const totalInputTokens = inputTokens + cacheCreationTokens + cacheReadTokens;

  // Try to lift contextWindow from claude's modelUsage block when present.
  let contextWindow = DEFAULT_CONTEXT_WINDOW[cli];
  const mu = r.modelUsage ?? r.model_usage;
  if (mu && typeof mu === 'object') {
    const inner = Object.values(mu as Record<string, unknown>)[0];
    if (inner && typeof inner === 'object') {
      const cw = (inner as Record<string, unknown>).contextWindow;
      if (typeof cw === 'number') contextWindow = cw;
    }
  }

  const fraction = contextWindow > 0 ? Math.min(1, totalInputTokens / contextWindow) : 0;
  const freeTokens = Math.max(0, contextWindow - totalInputTokens);

  // Approximate /context-like category breakdown from what stream-json gives us.
  // claude does not expose system-prompt vs tools vs skills in the result event,
  // so we group cache_creation as "System+Tools (cached first turn)", cache_read
  // as "Cached (subsequent reads)", and input_tokens as "This turn".
  const pct = (t: number): number => contextWindow > 0 ? (t / contextWindow) * 100 : 0;
  const breakdown = [
    { key: 'cache_creation', label: 'System + tools (cache create)', tokens: cacheCreationTokens, pct: pct(cacheCreationTokens), color: '#f97316' },
    { key: 'cache_read', label: 'Cached (cache read)', tokens: cacheReadTokens, pct: pct(cacheReadTokens), color: '#a855f7' },
    { key: 'input', label: 'This turn input', tokens: inputTokens, pct: pct(inputTokens), color: '#2563eb' },
    { key: 'free', label: 'Free space', tokens: freeTokens, pct: pct(freeTokens), color: '#e2e8f0' },
  ].filter(b => b.tokens > 0 || b.key === 'free');

  return {
    inputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    outputTokens,
    totalInputTokens,
    contextWindow,
    fraction,
    empty: totalInputTokens === 0 && outputTokens === 0,
    freeTokens,
    breakdown,
  };
}

export function useAiContext() {
  function record(cli: CliKind, raw: unknown) {
    usage.value = parseUsage(cli, raw);
  }

  function reset(cli: CliKind) {
    usage.value = emptyUsage(cli);
  }

  const fractionPct = computed(() => Math.round(usage.value.fraction * 100));
  const usageLabel = computed(() => {
    if (usage.value.empty) return '';
    const t = usage.value.totalInputTokens;
    const w = usage.value.contextWindow;
    return `${formatTokens(t)} / ${formatTokens(w)} (${fractionPct.value}%)`;
  });

  return { usage, record, reset, fractionPct, usageLabel };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
