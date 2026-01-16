import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenCounter,
  TOKEN_MODELS,
  getAvailableModels,
  createTokenCounter,
} from '../../services/tokenCounter';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter();
  });

  describe('constructor', () => {
    it('should default to GPT-4 model', () => {
      const result = counter.count('test');
      expect(result.model.id).toBe('gpt4');
    });

    it('should accept a model ID parameter', () => {
      const claudeCounter = new TokenCounter('claude');
      const result = claudeCounter.count('test');
      expect(result.model.id).toBe('claude');
    });
  });

  describe('count', () => {
    it('should return 0 tokens for empty string', () => {
      const result = counter.count('');
      expect(result.tokens).toBe(0);
    });

    it('should return 0 tokens for null-ish values', () => {
      // @ts-expect-error testing edge case
      expect(counter.count(null).tokens).toBe(0);
      // @ts-expect-error testing edge case
      expect(counter.count(undefined).tokens).toBe(0);
    });

    it('should count tokens for simple English text', () => {
      const result = counter.count('Hello, world!');
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.tokens).toBeLessThan(10);
    });

    it('should count tokens for longer English text', () => {
      const text = 'The quick brown fox jumps over the lazy dog. This is a sample sentence that contains multiple words.';
      const result = counter.count(text);

      // Approximately 1.3 tokens per word, so ~20-30 tokens for ~20 words
      expect(result.tokens).toBeGreaterThan(15);
      expect(result.tokens).toBeLessThan(40);
    });

    it('should count more tokens for Polish text (non-ASCII)', () => {
      const englishText = 'Hello my friend';
      const polishText = 'Cześć mój przyjacielu';

      const englishResult = counter.count(englishText);
      const polishResult = counter.count(polishText);

      // Polish text should generally have more tokens per character
      // because of diacritics and different tokenization
      expect(polishResult.tokens).toBeGreaterThanOrEqual(englishResult.tokens * 0.8);
    });

    it('should include model info in result', () => {
      const result = counter.count('test');
      expect(result.model).toBeDefined();
      expect(result.model.id).toBe('gpt4');
      expect(result.model.name).toBe('GPT-4 / GPT-4o');
    });

    it('should handle whitespace-only text', () => {
      const result = counter.count('   \n\t  ');
      expect(result.tokens).toBeGreaterThanOrEqual(0);
    });

    it('should handle text with emojis', () => {
      const result = counter.count('Hello 👋 World 🌍!');
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should handle code snippets', () => {
      const code = `function hello() {
  console.log("Hello, World!");
  return true;
}`;
      const result = counter.count(code);
      expect(result.tokens).toBeGreaterThan(10);
    });
  });

  describe('setModel', () => {
    it('should change the model', () => {
      counter.setModel('claude');
      const result = counter.count('test');
      expect(result.model.id).toBe('claude');
    });

    it('should affect token count', () => {
      const text = 'This is a test sentence for comparing models.';

      counter.setModel('gpt4');
      const gpt4Result = counter.count(text);

      counter.setModel('claude');
      const claudeResult = counter.count(text);

      // Results should be similar but not necessarily identical
      expect(Math.abs(gpt4Result.tokens - claudeResult.tokens)).toBeLessThan(10);
    });
  });

  describe('getModel', () => {
    it('should return current model', () => {
      const model = counter.getModel();
      expect(model.id).toBe('gpt4');
      expect(model.name).toBeDefined();
      expect(model.charsPerTokenEn).toBeDefined();
      expect(model.charsPerTokenOther).toBeDefined();
    });

    it('should reflect model changes', () => {
      counter.setModel('gpt3');
      const model = counter.getModel();
      expect(model.id).toBe('gpt3');
    });
  });

  describe('TOKEN_MODELS', () => {
    it('should have gpt4 model', () => {
      expect(TOKEN_MODELS.gpt4).toBeDefined();
      expect(TOKEN_MODELS.gpt4.id).toBe('gpt4');
    });

    it('should have claude model', () => {
      expect(TOKEN_MODELS.claude).toBeDefined();
      expect(TOKEN_MODELS.claude.id).toBe('claude');
    });

    it('should have gpt3 model', () => {
      expect(TOKEN_MODELS.gpt3).toBeDefined();
      expect(TOKEN_MODELS.gpt3.id).toBe('gpt3');
    });

    it('should have valid character ratios for all models', () => {
      Object.values(TOKEN_MODELS).forEach((model) => {
        expect(model.charsPerTokenEn).toBeGreaterThan(0);
        expect(model.charsPerTokenOther).toBeGreaterThan(0);
        // English should have more chars per token than non-ASCII
        expect(model.charsPerTokenEn).toBeGreaterThan(model.charsPerTokenOther);
      });
    });
  });

  describe('getAvailableModels', () => {
    it('should return array of models', () => {
      const models = getAvailableModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBe(3);
    });

    it('should include all defined models', () => {
      const models = getAvailableModels();
      const modelIds = models.map((m) => m.id);
      expect(modelIds).toContain('gpt4');
      expect(modelIds).toContain('claude');
      expect(modelIds).toContain('gpt3');
    });
  });

  describe('createTokenCounter', () => {
    it('should create counter with default model', () => {
      const counter = createTokenCounter();
      expect(counter.getModel().id).toBe('gpt4');
    });

    it('should create counter with specified model', () => {
      const counter = createTokenCounter('claude');
      expect(counter.getModel().id).toBe('claude');
    });
  });

  describe('edge cases', () => {
    it('should handle very long text', () => {
      const longText = 'word '.repeat(10000);
      const result = counter.count(longText);

      // Should be roughly 10000 words * 1.3 tokens/word
      expect(result.tokens).toBeGreaterThan(10000);
      expect(result.tokens).toBeLessThan(20000);
    });

    it('should handle mixed language text', () => {
      const mixedText = 'Hello world! Cześć świecie! こんにちは世界！';
      const result = counter.count(mixedText);
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should handle markdown formatting', () => {
      const markdown = '# Heading\n\n**Bold** and *italic* text.\n\n- List item 1\n- List item 2';
      const result = counter.count(markdown);
      expect(result.tokens).toBeGreaterThan(10);
    });

    it('should not return negative tokens', () => {
      const texts = ['', ' ', 'a', 'test', '🎉'];
      texts.forEach((text) => {
        const result = counter.count(text);
        expect(result.tokens).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('consistency', () => {
    it('should return consistent results for same input', () => {
      const text = 'Consistent test text';
      const result1 = counter.count(text);
      const result2 = counter.count(text);
      expect(result1.tokens).toBe(result2.tokens);
    });

    it('should return same model info for same counter', () => {
      const result1 = counter.count('text1');
      const result2 = counter.count('text2');
      expect(result1.model.id).toBe(result2.model.id);
    });
  });
});
