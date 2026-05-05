import { computed, ref, type ComputedRef, type Ref } from 'vue';

export interface PinnedItem {
  id: string;
  text: string;
  createdAt: string;
}

export interface PinnedSelectionsOptions {
  liveSelectionText: ComputedRef<string | null> | Ref<string | null>;
}

export function useAiPinnedSelections(opts: PinnedSelectionsOptions) {
  const pinnedSelections = ref<PinnedItem[]>([]);
  const includePinned = ref<boolean>(true);
  const attachmentModal = ref<Array<{ id: string; text: string }> | null>(null);

  const showLiveSelection = computed<boolean>(() => {
    const t = opts.liveSelectionText.value;
    if (!t) return false;
    return !pinnedSelections.value.some(p => p.text === t);
  });

  function pinCurrentSelection() {
    const t = opts.liveSelectionText.value;
    if (!t) return;
    if (pinnedSelections.value.some(p => p.text === t)) return;
    pinnedSelections.value.push({
      id: crypto.randomUUID(),
      text: t,
      createdAt: new Date().toISOString(),
    });
    includePinned.value = true;
  }

  function removePin(id: string) {
    pinnedSelections.value = pinnedSelections.value.filter(p => p.id !== id);
  }

  function clearAllPins() {
    pinnedSelections.value = [];
  }

  function previewOf(text: string, max = 100): string {
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  function openAttachment(pins: Array<{ id: string; text: string }>) {
    attachmentModal.value = pins;
  }

  function closeAttachment() {
    attachmentModal.value = null;
  }

  return {
    pinnedSelections,
    includePinned,
    showLiveSelection,
    attachmentModal,
    pinCurrentSelection,
    removePin,
    clearAllPins,
    previewOf,
    openAttachment,
    closeAttachment,
  };
}
