import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTokenCounter } from '../../composables/useTokenCounter';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

describe('useTokenCounter', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return tokenCount of 0 initially', () => {
      const { tokenCount } = useTokenCounter();
      expect(tokenCount.value).toBe(0);
    });

    it('should have isVisible set to true by default', () => {
      const { isVisible } = useTokenCounter();
      expect(isVisible.value).toBe(true);
    });

    it('should have GPT-4 as default model', () => {
      const { currentModel, modelName } = useTokenCounter();
      expect(currentModel.value).toBe('gpt4');
      expect(modelName.value).toBe('GPT-4 / GPT-4o');
    });

    it('should provide list of available models', () => {
      const { availableModels } = useTokenCounter();
      expect(availableModels.length).toBe(3);
      expect(availableModels.map((m) => m.id)).toContain('gpt4');
      expect(availableModels.map((m) => m.id)).toContain('claude');
      expect(availableModels.map((m) => m.id)).toContain('gpt3');
    });
  });

  describe('updateText', () => {
    it('should update token count when text is provided', () => {
      const { tokenCount, updateText } = useTokenCounter();

      updateText('Hello, world! This is a test.');
      expect(tokenCount.value).toBeGreaterThan(0);
    });

    it('should set token count to 0 for empty string', () => {
      const { tokenCount, updateText } = useTokenCounter();

      updateText('Some text first');
      expect(tokenCount.value).toBeGreaterThan(0);

      updateText('');
      expect(tokenCount.value).toBe(0);
    });

    it('should update token count when text changes', () => {
      const { tokenCount, updateText } = useTokenCounter();

      updateText('Short');
      const shortCount = tokenCount.value;

      updateText('This is a much longer text with many more words and characters');
      const longCount = tokenCount.value;

      expect(longCount).toBeGreaterThan(shortCount);
    });
  });

  describe('changeModel', () => {
    it('should change the current model', () => {
      const { currentModel, changeModel } = useTokenCounter();

      changeModel('gpt4'); // Reset to known state
      expect(currentModel.value).toBe('gpt4');

      changeModel('claude');
      expect(currentModel.value).toBe('claude');
    });

    it('should update model name when model changes', () => {
      const { modelName, changeModel } = useTokenCounter();

      changeModel('claude');
      expect(modelName.value).toBe('Claude');

      changeModel('gpt3');
      expect(modelName.value).toBe('GPT-3.5');

      changeModel('gpt4');
      expect(modelName.value).toBe('GPT-4 / GPT-4o');
    });

    it('should recalculate tokens when model changes', () => {
      const { tokenCount, updateText, changeModel } = useTokenCounter();

      updateText('This is a test sentence for comparing different AI model tokenizers.');

      changeModel('gpt4');
      const gpt4Count = tokenCount.value;

      changeModel('claude');
      const claudeCount = tokenCount.value;

      // Counts should be similar but may differ slightly
      // The important thing is that recalculation happens
      expect(gpt4Count).toBeGreaterThan(0);
      expect(claudeCount).toBeGreaterThan(0);
    });
  });

  describe('toggleVisibility', () => {
    it('should toggle visibility', () => {
      const { isVisible, toggleVisibility } = useTokenCounter();

      expect(isVisible.value).toBe(true);

      toggleVisibility();
      expect(isVisible.value).toBe(false);

      toggleVisibility();
      expect(isVisible.value).toBe(true);
    });
  });

  describe('reactive updates', () => {
    it('should maintain reactivity across multiple updates', () => {
      const { tokenCount, updateText } = useTokenCounter();

      const counts: number[] = [];

      updateText('First');
      counts.push(tokenCount.value);

      updateText('Second longer text');
      counts.push(tokenCount.value);

      updateText('Third even longer text with more words');
      counts.push(tokenCount.value);

      // Each subsequent text should have more tokens
      expect(counts[1]).toBeGreaterThan(counts[0]);
      expect(counts[2]).toBeGreaterThan(counts[1]);
    });
  });

  describe('integration with settings', () => {
    it('should share model state across instances', () => {
      const instance1 = useTokenCounter();
      const instance2 = useTokenCounter();

      instance1.changeModel('claude');

      // Both instances should reflect the same model
      expect(instance1.currentModel.value).toBe('claude');
      expect(instance2.currentModel.value).toBe('claude');
    });
  });
});
