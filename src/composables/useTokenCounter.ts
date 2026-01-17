import { ref, computed, watch } from 'vue';
import {
  TokenCounter,
  TOKEN_MODELS,
  type TokenModelId,
  type TokenCountResult,
  getAvailableModels,
} from '../services/tokenCounter';
import { useSettings } from './useSettings';

/**
 * Composable for reactive token counting in Vue components.
 *
 * Automatically syncs with app settings for model selection.
 * Updates token count when text changes.
 *
 * @example
 * ```vue
 * <script setup>
 * const { tokenCount, updateText, isVisible } = useTokenCounter();
 *
 * // Update when editor content changes
 * watch(editorContent, (content) => updateText(content));
 * </script>
 *
 * <template>
 *   <span v-if="isVisible">{{ tokenCount }} tokens</span>
 * </template>
 * ```
 */
export function useTokenCounter() {
  const { settings, setTokenModel, toggleShowTokenCount } = useSettings();

  const counter = new TokenCounter(settings.value.tokenModel);
  const currentText = ref('');
  const result = ref<TokenCountResult>({ tokens: 0, model: counter.getModel() });

  // Sync counter model with settings
  watch(
    () => settings.value.tokenModel,
    (newModel) => {
      counter.setModel(newModel);
      // Recalculate with new model
      result.value = counter.count(currentText.value);
    }
  );

  /**
   * Update the text and recalculate token count.
   */
  const updateText = (text: string) => {
    currentText.value = text;
    result.value = counter.count(text);
  };

  /**
   * Current token count.
   */
  const tokenCount = computed(() => result.value.tokens);

  /**
   * Current model name for display.
   */
  const modelName = computed(() => TOKEN_MODELS[settings.value.tokenModel].name);

  /**
   * Whether token counter should be visible.
   */
  const isVisible = computed(() => settings.value.showTokenCount);

  /**
   * Current model ID.
   */
  const currentModel = computed(() => settings.value.tokenModel);

  /**
   * Available models for selection.
   */
  const availableModels = getAvailableModels();

  /**
   * Change the token model.
   */
  const changeModel = (modelId: TokenModelId) => {
    setTokenModel(modelId);
  };

  return {
    tokenCount,
    modelName,
    isVisible,
    currentModel,
    availableModels,
    updateText,
    changeModel,
    toggleVisibility: toggleShowTokenCount,
  };
}
