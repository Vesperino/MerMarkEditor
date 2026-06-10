import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/aiCommands', () => ({
  aiCommands: {
    ollamaModels: vi.fn(),
    openaiModels: vi.fn(),
  },
}));

import { aiCommands } from '../../services/aiCommands';
import {
  modelsFor,
  effortsFor,
  ollamaModelsToOptions,
  openaiModelsToOptions,
  useAiModels,
  CUSTOM_MODEL_SENTINEL,
} from '../../composables/useAiModels';

describe('useAiModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claude and codex return their static lists', () => {
    expect(modelsFor('claude').some((m) => m.id === 'opus')).toBe(true);
    expect(modelsFor('codex').some((m) => m.id === 'gpt-5-codex')).toBe(true);
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
});
