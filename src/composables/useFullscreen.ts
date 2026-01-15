import { ref, watch, onUnmounted, type Ref } from 'vue';

export interface UseFullscreenReturn {
  isFullscreen: Ref<boolean>;
  toggleFullscreen: () => void;
}

export function useFullscreen(): UseFullscreenReturn {
  const isFullscreen = ref(false);

  const toggleFullscreen = () => {
    isFullscreen.value = !isFullscreen.value;
    if (isFullscreen.value) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  };

  const closeFullscreen = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isFullscreen.value) {
      toggleFullscreen();
    }
  };

  // Add/remove keyboard listener for Escape
  watch(isFullscreen, (val) => {
    if (val) {
      window.addEventListener('keydown', closeFullscreen);
    } else {
      window.removeEventListener('keydown', closeFullscreen);
    }
  });

  // Cleanup on unmount
  onUnmounted(() => {
    window.removeEventListener('keydown', closeFullscreen);
    if (isFullscreen.value) {
      document.body.style.overflow = '';
    }
  });

  return {
    isFullscreen,
    toggleFullscreen,
  };
}
