/**
 * Token Counter Service
 *
 * Provides token estimation for various AI models.
 * Uses heuristic-based counting that approximates tokenization
 * without requiring external tokenizer libraries.
 */

export type TokenModelId = 'gpt' | 'claude' | 'gemini';

export interface TokenModel {
  id: TokenModelId;
  name: string;
  /** Average characters per token for English text */
  charsPerTokenEn: number;
  /** Average characters per token for non-English text (e.g., Polish) */
  charsPerTokenOther: number;
}

export interface TokenCountResult {
  tokens: number;
  model: TokenModel;
}

/**
 * Predefined token models with their characteristics.
 * Values based on official documentation and empirical observations.
 *
 * OpenAI models use o200k_base tokenizer (~4 chars/token EN)
 * Claude models use similar BPE (~3.8 chars/token EN)
 * Gemini models use ~4 chars/token
 */
export const TOKEN_MODELS: Record<TokenModelId, TokenModel> = {
  // OpenAI GPT Models (o200k_base encoding)
  'gpt': {
    id: 'gpt',
    name: 'GPT (OpenAI)',
    charsPerTokenEn: 4.0,
    charsPerTokenOther: 2.8,
  },

  // Anthropic Claude Models
  'claude': {
    id: 'claude',
    name: 'Claude (Anthropic)',
    charsPerTokenEn: 3.8,
    charsPerTokenOther: 2.6,
  },

  // Google Gemini Models
  'gemini': {
    id: 'gemini',
    name: 'Gemini (Google)',
    charsPerTokenEn: 4.0,
    charsPerTokenOther: 2.8,
  },
};

/**
 * Detects if text contains significant non-ASCII characters.
 * Used to adjust token estimation for non-English text.
 */
function detectNonAsciiRatio(text: string): number {
  if (text.length === 0) return 0;

  let nonAsciiCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) {
      nonAsciiCount++;
    }
  }
  return nonAsciiCount / text.length;
}

/**
 * Counts whitespace-separated words in text.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Token Counter class for estimating token counts.
 *
 * @example
 * ```ts
 * const counter = new TokenCounter('gpt4');
 * const result = counter.count('Hello, world!');
 * console.log(result.tokens); // ~4
 * ```
 */
export class TokenCounter {
  private model: TokenModel;

  constructor(modelId: TokenModelId = 'gpt') {
    this.model = TOKEN_MODELS[modelId];
  }

  /**
   * Set the model used for token estimation.
   */
  setModel(modelId: TokenModelId): void {
    this.model = TOKEN_MODELS[modelId];
  }

  /**
   * Get the current model.
   */
  getModel(): TokenModel {
    return this.model;
  }

  /**
   * Count tokens in the given text.
   *
   * The algorithm:
   * 1. Detects the ratio of non-ASCII characters
   * 2. Interpolates between English and non-English character ratios
   * 3. Calculates token count based on character count
   * 4. Applies word-based correction for better accuracy
   */
  count(text: string): TokenCountResult {
    if (!text || text.length === 0) {
      return { tokens: 0, model: this.model };
    }

    const charCount = text.length;
    const wordCount = countWords(text);
    const nonAsciiRatio = detectNonAsciiRatio(text);

    // Interpolate chars per token based on non-ASCII ratio
    const charsPerToken =
      this.model.charsPerTokenEn * (1 - nonAsciiRatio) +
      this.model.charsPerTokenOther * nonAsciiRatio;

    // Character-based estimation
    const charBasedTokens = charCount / charsPerToken;

    // Word-based estimation (roughly 1.3 tokens per word for English)
    // This helps correct for edge cases
    const tokensPerWord = 1.3 + (nonAsciiRatio * 0.5);
    const wordBasedTokens = wordCount * tokensPerWord;

    // Weighted average favoring character-based for longer texts
    const weight = Math.min(charCount / 100, 1);
    const tokens = Math.round(
      charBasedTokens * weight + wordBasedTokens * (1 - weight)
    );

    return {
      tokens: Math.max(tokens, 0),
      model: this.model,
    };
  }
}

/**
 * Get list of available models for UI selection.
 */
export function getAvailableModels(): TokenModel[] {
  return Object.values(TOKEN_MODELS);
}

/**
 * Create a token counter instance with default model.
 */
export function createTokenCounter(modelId?: TokenModelId): TokenCounter {
  return new TokenCounter(modelId);
}
