import { ref, onUnmounted } from 'vue';

const DEFAULT_DURATION_MS = 3000;

export function useAiToolToast(durationMs = DEFAULT_DURATION_MS) {
  const toolActivity = ref<string | null>(null);
  let timer: number | null = null;

  function trigger(tool: string) {
    toolActivity.value = tool;
    if (timer != null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      toolActivity.value = null;
      timer = null;
    }, durationMs);
  }

  function clear() {
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
    toolActivity.value = null;
  }

  onUnmounted(clear);

  return { toolActivity, trigger, clear };
}
