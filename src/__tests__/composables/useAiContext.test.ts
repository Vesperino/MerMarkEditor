import { describe, it, expect } from 'vitest';
import { parseUsage } from '../../composables/useAiContext';

describe('parseUsage', () => {
  it('returns empty when raw is null', () => {
    const u = parseUsage('claude', null);
    expect(u.empty).toBe(true);
    expect(u.totalInputTokens).toBe(0);
  });

  it('sums claude input + cache_creation + cache_read', () => {
    const u = parseUsage('claude', {
      input_tokens: 6,
      cache_creation_input_tokens: 14810,
      cache_read_input_tokens: 19073,
      output_tokens: 15,
    });
    expect(u.totalInputTokens).toBe(6 + 14810 + 19073);
    expect(u.outputTokens).toBe(15);
    expect(u.empty).toBe(false);
  });

  it('lifts contextWindow from modelUsage block when present', () => {
    const u = parseUsage('claude', {
      input_tokens: 100,
      modelUsage: { 'claude-opus-4-7': { contextWindow: 1_000_000 } },
    });
    expect(u.contextWindow).toBe(1_000_000);
  });

  it('falls back to per-cli default contextWindow', () => {
    const claudeU = parseUsage('claude', { input_tokens: 1 });
    expect(claudeU.contextWindow).toBe(200_000);
    const codexU = parseUsage('codex', { input_tokens: 1 });
    expect(codexU.contextWindow).toBe(272_000);
  });

  it('picks the main model contextWindow by key when modelUsage has side models first', () => {
    // serde_json re-sorts modelUsage alphabetically, so the haiku side model
    // lands before the opus main model — the model key must win.
    const u = parseUsage('claude', {
      input_tokens: 100,
      model: 'claude-opus-4-7',
      modelUsage: {
        'claude-haiku-4-5': { contextWindow: 200_000 },
        'claude-opus-4-7': { contextWindow: 1_000_000 },
      },
    });
    expect(u.contextWindow).toBe(1_000_000);
  });

  it('falls back to MAX contextWindow across modelUsage when model key is absent', () => {
    const u = parseUsage('claude', {
      input_tokens: 100,
      modelUsage: {
        'claude-haiku-4-5': { contextWindow: 200_000 },
        'claude-opus-4-7': { contextWindow: 1_000_000 },
      },
    });
    expect(u.contextWindow).toBe(1_000_000);
  });

  it('falls back to MAX when model key does not match any modelUsage entry', () => {
    const u = parseUsage('claude', {
      input_tokens: 100,
      model: 'claude-something-else',
      modelUsage: {
        'claude-haiku-4-5': { contextWindow: 200_000 },
        'claude-opus-4-7': { contextWindow: 1_000_000 },
      },
    });
    expect(u.contextWindow).toBe(1_000_000);
  });

  it('clamps fraction to 1.0 when usage exceeds window', () => {
    const u = parseUsage('claude', {
      input_tokens: 500_000,
      cache_creation_input_tokens: 500_000,
    });
    expect(u.fraction).toBe(1);
  });

  it('reflects a single final-call snapshot as real occupancy (~30K, not cumulative)', () => {
    // The normalizer hands parseUsage the LAST assistant message's per-call
    // snapshot, not the cumulative result total. A ~30K turn must read ~30K.
    const snapshot = parseUsage('claude', {
      input_tokens: 6,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 30000,
      output_tokens: 40,
    });
    expect(snapshot.totalInputTokens).toBe(6 + 1000 + 30000);
    expect(snapshot.fraction).toBeLessThan(0.2);
  });

  it('keeps codex single-usage parsing unchanged', () => {
    const u = parseUsage('codex', { input_tokens: 1 });
    expect(u.totalInputTokens).toBe(1);
    expect(u.contextWindow).toBe(272_000);
  });

  it('splits codex cached_input_tokens out of input_tokens', () => {
    // codex input_tokens INCLUDES cached; total must equal original input.
    const u = parseUsage('codex', {
      input_tokens: 10_000,
      cached_input_tokens: 8_000,
      output_tokens: 50,
    });
    expect(u.cacheReadTokens).toBe(8_000);
    expect(u.inputTokens).toBe(2_000);
    expect(u.totalInputTokens).toBe(10_000);
  });

  it('clamps codex fresh input at 0 when cached exceeds input', () => {
    const u = parseUsage('codex', { input_tokens: 100, cached_input_tokens: 150 });
    expect(u.inputTokens).toBe(0);
    expect(u.cacheReadTokens).toBe(150);
  });

  it('lifts codex contextWindow from injected model + modelUsage', () => {
    const u = parseUsage('codex', {
      input_tokens: 10,
      model: 'gpt-5.4',
      modelUsage: { 'gpt-5.4': { contextWindow: 272_000 } },
    });
    expect(u.contextWindow).toBe(272_000);
  });

  it('leaves claude usage without cached_input_tokens untouched (regression)', () => {
    const u = parseUsage('claude', {
      input_tokens: 6,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 30_000,
      output_tokens: 40,
    });
    expect(u.inputTokens).toBe(6);
    expect(u.cacheReadTokens).toBe(30_000);
    expect(u.totalInputTokens).toBe(6 + 1000 + 30_000);
  });
});
