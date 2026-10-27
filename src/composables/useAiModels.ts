import { ref } from 'vue';
import { aiCommands, type ClaudeModelInfo, type CliKind, type CodexModelInfo } from '../services/aiCommands';
import { isOutdated } from './useAiCliUpdates';

export interface AiModelOption {
  id: string;
  label: string;
  custom?: boolean;
  disabled?: boolean;
  title?: string;
  efforts?: string[];
}

export interface AiEffortOption {
  id: string;
  label: string;
}

export const CUSTOM_MODEL_SENTINEL = '__custom__';

// Aliases resolve to the newest model of each tier in the installed Claude Code;
// refreshClaudeModels adds whatever else its /model picker currently offers.
export const CLAUDE_MODELS: AiModelOption[] = [
  { id: 'opus', label: 'Opus (latest)' },
  { id: 'sonnet', label: 'Sonnet (latest)' },
  { id: 'haiku', label: 'Haiku (latest)' },
  { id: 'fable', label: 'Fable (latest)' },
  { id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true },
];

// An empty id leaves --model off, so codex uses its own (always current) default.
export const CODEX_DEFAULT_MODEL: AiModelOption = { id: '', label: 'Codex default' };

// Curated fallback, used only when the codex CLI cannot list its models
// (see refreshCodexModels).
export const CODEX_MODELS: AiModelOption[] = [
  CODEX_DEFAULT_MODEL,
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true },
];

export const CLAUDE_EFFORTS: AiEffortOption[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
];

const EFFORT_LABELS: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max', ultra: 'Ultra',
};

export const CODEX_EFFORTS: AiEffortOption[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

/** Convert installed Ollama model names (from /api/tags) into picker options. */
export function ollamaModelsToOptions(names: string[]): AiModelOption[] {
  const opts: AiModelOption[] = names.map((name) => ({ id: name, label: name }));
  opts.push({ id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true });
  return opts;
}

/** Convert model ids a local OpenAI-compatible server exposes (data[].id) into picker options. */
export function openaiModelsToOptions(ids: string[]): AiModelOption[] {
  const opts: AiModelOption[] = ids.map((id) => ({ id, label: id }));
  opts.push({ id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true });
  return opts;
}

/** Convert the codex model catalog into picker options. */
export function codexModelsToOptions(models: CodexModelInfo[]): AiModelOption[] {
  const opts: AiModelOption[] = models.map((m) => ({ id: m.id, label: m.label || m.id, efforts: m.efforts ?? [] }));
  opts.unshift(CODEX_DEFAULT_MODEL);
  opts.push({ id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true });
  return opts;
}

/** Add Claude Code's own /model picker entries after the aliases. Entries the
 *  installed CLI is too old for stay visible but disabled, with the reason;
 *  Claude Code rewrites its list only on its next run, so once the installed
 *  version meets the "x.y.z+" the reason names, the entry is dropped. */
export function claudeModelsToOptions(models: ClaudeModelInfo[], installed: string | null = null): AiModelOption[] {
  const satisfied = (m: ClaudeModelInfo) => {
    const required = /(\d+\.\d+\.\d+)\+/.exec(m.description ?? '')?.[1];
    return !!m.disabled && !!required && !!installed && !isOutdated(installed, required);
  };
  const extra = models
    .filter((m) => !CLAUDE_MODELS.some((o) => o.id === m.id) && !satisfied(m))
    .map((m): AiModelOption => (m.disabled
      ? { id: m.id, label: m.description || m.label, disabled: true }
      : { id: m.id, label: m.description?.split(' · ')[0] || m.label, title: m.description ?? undefined }));
  return [...CLAUDE_MODELS.slice(0, -1), ...extra, ...CLAUDE_MODELS.slice(-1)];
}

const ollamaModels = ref<AiModelOption[]>([{ id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true }]);
const ollamaModelsLoading = ref(false);
const openaiModels = ref<AiModelOption[]>([{ id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true }]);
const openaiModelsLoading = ref(false);
const claudeModels = ref<AiModelOption[]>(CLAUDE_MODELS);
// Empty means "catalog unavailable" — modelsFor falls back to CODEX_MODELS.
const codexModels = ref<AiModelOption[]>([]);
const codexModelsLoading = ref(false);

export function useAiModels() {
  async function refreshOllamaModels(baseUrl: string | null = null): Promise<AiModelOption[]> {
    ollamaModelsLoading.value = true;
    try {
      const names = await aiCommands.ollamaModels(baseUrl);
      ollamaModels.value = ollamaModelsToOptions(names);
    } catch {
      ollamaModels.value = ollamaModelsToOptions([]);
    } finally {
      ollamaModelsLoading.value = false;
    }
    return ollamaModels.value;
  }

  async function refreshOpenaiModels(baseUrl: string | null = null): Promise<AiModelOption[]> {
    openaiModelsLoading.value = true;
    try {
      const ids = await aiCommands.openaiModels(baseUrl);
      openaiModels.value = openaiModelsToOptions(ids);
    } catch {
      openaiModels.value = openaiModelsToOptions([]);
    } finally {
      openaiModelsLoading.value = false;
    }
    return openaiModels.value;
  }

  async function refreshClaudeModels(installed: string | null = null): Promise<AiModelOption[]> {
    try {
      claudeModels.value = claudeModelsToOptions(await aiCommands.claudeModels(), installed);
    } catch {
      claudeModels.value = CLAUDE_MODELS;
    }
    return claudeModels.value;
  }

  async function refreshCodexModels(cliPath: string | null = null): Promise<AiModelOption[]> {
    codexModelsLoading.value = true;
    try {
      const models = await aiCommands.codexModels(cliPath);
      codexModels.value = models.length > 0 ? codexModelsToOptions(models) : [];
    } catch {
      codexModels.value = [];
    } finally {
      codexModelsLoading.value = false;
    }
    return modelsFor('codex');
  }

  return {
    ollamaModels, ollamaModelsLoading, refreshOllamaModels,
    openaiModels, openaiModelsLoading, refreshOpenaiModels,
    codexModels, codexModelsLoading, refreshCodexModels,
    claudeModels, refreshClaudeModels,
  };
}

export function modelsFor(cli: CliKind): AiModelOption[] {
  if (cli === 'claude') return claudeModels.value;
  if (cli === 'codex') return codexModels.value.length > 0 ? codexModels.value : CODEX_MODELS;
  if (cli === 'openai') return openaiModels.value;
  return ollamaModels.value;
}

export function effortsFor(cli: CliKind, model = ''): AiEffortOption[] {
  if (cli === 'claude') return CLAUDE_EFFORTS;
  if (cli !== 'codex') return [];
  const efforts = modelsFor('codex').find((m) => m.id === model)?.efforts;
  return efforts?.length ? efforts.map((id) => ({ id, label: EFFORT_LABELS[id] ?? id })) : CODEX_EFFORTS;
}
