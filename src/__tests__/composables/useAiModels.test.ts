import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/aiCommands', () => ({
  aiCommands: {
    ollamaModels: vi.fn(),
    openaiModels: vi.fn(),
    codexModels: vi.fn(),
    claudeModels: vi.fn(),
  },
}));

import { aiCommands } from '../../services/aiCommands';
import {
  modelsFor,
  effortsFor,
  ollamaModelsToOptions,
  openaiModelsToOptions,
  codexModelsToOptions,
  claudeModelsToOptions,
  useAiModels,
  CLAUDE_MODELS,
  CODEX_MODELS,
  CUSTOM_MODEL_SENTINEL,
} from '../../composables/useAiModels';

describe('useAiModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claude and codex start from aliases and the curated fallback', () => {
    expect(modelsFor('claude')).toEqual(CLAUDE_MODELS);
    expect(modelsFor('codex')).toEqual(CODEX_MODELS);
  });

  it('claudeModelsToOptions adds the /model picker entries between the aliases and custom', () => {
    const opts = claudeModelsToOptions([
      { id: 'claude-fable-5-1[1m]', label: 'Fable', description: 'Fable 5.1 · Most capable' },
      { id: 'cc-update-required-1', label: 'Opus 5.5 (disabled)', description: 'Update to 2.1.280+ to use Opus 5.5', disabled: true },
      { id: 'opus', label: 'Opus' },
    ]);
    expect(opts.map((o) => o.id)).toEqual(['opus', 'sonnet', 'haiku', 'fable', 'claude-fable-5-1[1m]', 'cc-update-required-1', CUSTOM_MODEL_SENTINEL]);
    expect(opts[4]).toEqual({ id: 'claude-fable-5-1[1m]', label: 'Fable 5.1', title: 'Fable 5.1 · Most capable' });
    expect(opts[5]).toEqual({ id: 'cc-update-required-1', label: 'Update to 2.1.280+ to use Opus 5.5', disabled: true });
  });

  it('refreshClaudeModels shows new models and keeps the aliases when the config is unreadable', async () => {
    (aiCommands.claudeModels as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue([{ id: 'claude-opus-6', label: 'Opus', description: 'Opus 6 · New' }]);
    const { refreshClaudeModels } = useAiModels();
    await refreshClaudeModels();
    expect(modelsFor('claude').some((m) => m.id === 'claude-opus-6')).toBe(true);

    (aiCommands.claudeModels as unknown as { mockRejectedValue: (v: unknown) => void })
      .mockRejectedValue(new Error('not installed'));
    await refreshClaudeModels();
    expect(modelsFor('claude')).toEqual(CLAUDE_MODELS);
  });

  it('effortsFor offers the efforts the picked codex model supports', async () => {
    (aiCommands.codexModels as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue([
        { id: 'gpt-6', label: 'GPT-6', efforts: ['low', 'xhigh', 'ultra'] },
        { id: 'gpt-old', label: 'Old' },
      ]);
    await useAiModels().refreshCodexModels('C:/bin/codex.exe');
    expect(aiCommands.codexModels).toHaveBeenCalledWith('C:/bin/codex.exe');
    expect(effortsFor('codex', 'gpt-6')).toEqual([
      { id: 'low', label: 'Low' }, { id: 'xhigh', label: 'Extra high' }, { id: 'ultra', label: 'Ultra' },
    ]);
    expect(effortsFor('codex', 'gpt-old').map((e) => e.id)).toEqual(['low', 'medium', 'high']);
  });

  it('effortsFor returns [] for ollama, populated for claude/codex', () => {
    expect(effortsFor('ollama')).toEqual([]);
    expect(effortsFor('claude').length).toBeGreaterThan(0);
    expect(effortsFor('codex').length).toBeGreaterThan(0);
  });

  it('ollamaModelsToOptions maps names and appends a custom option', () => {
    const opts = ollamaModelsToOptions(['llama3:8b', 'qwen2']);
    expect(opts[0]).toEqual({ id: 'llama3:8b', label: 'llama3:8b' });
    expect(opts[1]).toEqual({ id: 'qwen2', label: 'qwen2' });
    const custom = opts[opts.length - 1];
    expect(custom.id).toBe(CUSTOM_MODEL_SENTINEL);
    expect(custom.custom).toBe(true);
  });

  it('refreshOllamaModels populates modelsFor("ollama") from the invoke result', async () => {
    (aiCommands.ollamaModels as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue(['llama3:8b', 'mistral']);
    const { refreshOllamaModels } = useAiModels();
    await refreshOllamaModels('http://localhost:11434');
    const list = modelsFor('ollama');
    expect(list.some((m) => m.id === 'llama3:8b')).toBe(true);
    expect(list.some((m) => m.id === 'mistral')).toBe(true);
  });

  it('refreshOllamaModels degrades to just a custom option when invoke fails', async () => {
    (aiCommands.ollamaModels as unknown as { mockRejectedValue: (v: unknown) => void })
      .mockRejectedValue(new Error('connection refused'));
    const { refreshOllamaModels } = useAiModels();
    await refreshOllamaModels(null);
    const list = modelsFor('ollama');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(CUSTOM_MODEL_SENTINEL);
  });

  it('openaiModelsToOptions maps ids and appends a custom option', () => {
    const opts = openaiModelsToOptions(['qwen3.5-uncensored', 'phi']);
    expect(opts[0]).toEqual({ id: 'qwen3.5-uncensored', label: 'qwen3.5-uncensored' });
    expect(opts[1]).toEqual({ id: 'phi', label: 'phi' });
    const custom = opts[opts.length - 1];
    expect(custom.id).toBe(CUSTOM_MODEL_SENTINEL);
    expect(custom.custom).toBe(true);
  });

  it('refreshOpenaiModels populates modelsFor("openai") from the invoke result', async () => {
    (aiCommands.openaiModels as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue(['qwen3.5-uncensored', 'phi']);
    const { refreshOpenaiModels } = useAiModels();
    await refreshOpenaiModels('http://localhost:8080');
    const list = modelsFor('openai');
    expect(list.some((m) => m.id === 'qwen3.5-uncensored')).toBe(true);
    expect(list.some((m) => m.id === 'phi')).toBe(true);
  });

  it('refreshOpenaiModels degrades to just a custom option when invoke fails', async () => {
    (aiCommands.openaiModels as unknown as { mockRejectedValue: (v: unknown) => void })
      .mockRejectedValue(new Error('connection refused'));
    const { refreshOpenaiModels } = useAiModels();
    await refreshOpenaiModels(null);
    const list = modelsFor('openai');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(CUSTOM_MODEL_SENTINEL);
  });

  it('codexModelsToOptions maps entries and appends a custom option', () => {
    const opts = codexModelsToOptions([
      { id: 'gpt-5.5', label: 'GPT-5.5' },
      { id: 'gpt-5.3-codex', label: '' },
    ]);
    expect(opts[0]).toEqual({ id: '', label: 'Codex default' });
    expect(opts[1]).toEqual({ id: 'gpt-5.5', label: 'GPT-5.5', efforts: [] });
    expect(opts[2]).toEqual({ id: 'gpt-5.3-codex', label: 'gpt-5.3-codex', efforts: [] });
    const custom = opts[opts.length - 1];
    expect(custom.id).toBe(CUSTOM_MODEL_SENTINEL);
    expect(custom.custom).toBe(true);
  });

  it('refreshCodexModels populates modelsFor("codex") from the models_cache', async () => {
    (aiCommands.codexModels as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue([
        { id: 'gpt-5.5', label: 'GPT-5.5' },
        { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
      ]);
    const { refreshCodexModels } = useAiModels();
    await refreshCodexModels();
    const list = modelsFor('codex');
    expect(list.some((m) => m.id === 'gpt-5.5')).toBe(true);
    expect(list.some((m) => m.id === 'gpt-5.4-mini')).toBe(true);
    expect(list[list.length - 1].id).toBe(CUSTOM_MODEL_SENTINEL);
  });

  it('refreshCodexModels falls back to the curated list when the cache is empty', async () => {
    (aiCommands.codexModels as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue([]);
    const { refreshCodexModels } = useAiModels();
    await refreshCodexModels();
    expect(modelsFor('codex')).toEqual(CODEX_MODELS);
  });

  it('refreshCodexModels falls back to the curated list when invoke fails', async () => {
    (aiCommands.codexModels as unknown as { mockRejectedValue: (v: unknown) => void })
      .mockRejectedValue(new Error('command not found'));
    const { refreshCodexModels } = useAiModels();
    await refreshCodexModels();
    const list = modelsFor('codex');
    expect(list).toEqual(CODEX_MODELS);
    expect(list[list.length - 1].id).toBe(CUSTOM_MODEL_SENTINEL);
  });
});
