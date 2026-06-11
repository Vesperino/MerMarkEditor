import { ref } from 'vue';
import { aiCommands, type CliKind, type CodexModelInfo } from '../services/aiCommands';

export interface AiModelOption {
  id: string;
  label: string;
  custom?: boolean;
}

export interface AiEffortOption {
  id: string;
  label: string;
}

export const CUSTOM_MODEL_SENTINEL = '__custom__';

export const CLAUDE_MODELS: AiModelOption[] = [
  // Aliases — auto-resolve to the latest of each tier; safest default.
  { id: 'opus', label: 'Opus (latest alias)' },
  { id: 'sonnet', label: 'Sonnet (latest alias)' },
  { id: 'haiku', label: 'Haiku (latest alias)' },
  // Specific Fable versions (newest first).
  { id: 'claude-fable-5', label: 'Fable 5' },
  // Specific Opus versions (newest first).
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-opus-4-5', label: 'Opus 4.5' },
  // Specific Sonnet versions.
  { id: 'claude-sonnet-4-7', label: 'Sonnet 4.7' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  // Specific Haiku versions.
  { id: 'claude-haiku-4-7', label: 'Haiku 4.7' },
  { id: 'claude-haiku-4-6', label: 'Haiku 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  // Custom escape hatch.
  { id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true },
];

// Curated fallback, used only when the codex CLI's models_cache.json is
// unavailable (see refreshCodexModels).
export const CODEX_MODELS: AiModelOption[] = [
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { id: 'gpt-5.2', label: 'GPT-5.2' },
  { id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true },
];

export const CLAUDE_EFFORTS: AiEffortOption[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
];

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

/** Convert codex models_cache entries (slug + display name) into picker options. */
export function codexModelsToOptions(models: CodexModelInfo[]): AiModelOption[] {
  const opts: AiModelOption[] = models.map((m) => ({ id: m.id, label: m.label || m.id }));
  opts.push({ id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true });
  return opts;
}

const ollamaModels = ref<AiModelOption[]>([{ id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true }]);
const ollamaModelsLoading = ref(false);
const openaiModels = ref<AiModelOption[]>([{ id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true }]);
const openaiModelsLoading = ref(false);
// Empty means "cache unavailable" — modelsFor falls back to CODEX_MODELS.
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

  async function refreshCodexModels(): Promise<AiModelOption[]> {
    codexModelsLoading.value = true;
    try {
      const models = await aiCommands.codexModels();
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
  };
}

export function modelsFor(cli: CliKind): AiModelOption[] {
  if (cli === 'claude') return CLAUDE_MODELS;
  if (cli === 'codex') return codexModels.value.length > 0 ? codexModels.value : CODEX_MODELS;
  if (cli === 'openai') return openaiModels.value;
  return ollamaModels.value;
}

export function effortsFor(cli: CliKind): AiEffortOption[] {
  if (cli === 'claude') return CLAUDE_EFFORTS;
  if (cli === 'codex') return CODEX_EFFORTS;
  return [];
}
