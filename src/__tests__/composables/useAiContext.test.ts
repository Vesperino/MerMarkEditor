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
    expect(codexU.contextWindow).toBe(256_000);
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
    expect(u.contextWindow).toBe(256_000);
  });
});
