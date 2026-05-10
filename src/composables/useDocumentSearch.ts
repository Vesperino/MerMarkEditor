import { ref, type Ref } from 'vue';

export type DocumentSearchMode = 'visual' | 'code';

export interface DocumentSearchMatch {
  id: string;
  index: number;
  start: number;
  end: number;
}

export interface VisualSearchMatch extends DocumentSearchMatch {
  from: number;
  to: number;
}

export interface VisualTextMap {
  text: string;
  positions: Array<number | null>;
}

export interface DocumentSearchState {
  open: boolean;
  query: string;
  mode: DocumentSearchMode;
  matches: Array<DocumentSearchMatch | VisualSearchMatch>;
  activeIndex: number;
}

export interface UseDocumentSearchOptions {
  getMode: () => DocumentSearchMode;
  getCodeText: () => string;
  getVisualTextAndMap: () => VisualTextMap | null;
  focusCodeMatch: (match: DocumentSearchMatch) => void;
  focusVisualMatch: (match: VisualSearchMatch) => void;
  applyVisualHighlights: (matches: VisualSearchMatch[], activeIndex: number) => void;
  clearVisualHighlights: () => void;
  focusSearchInput?: () => void;
  focusEditor?: () => void;
}

export interface UseDocumentSearchReturn {
  state: Ref<DocumentSearchState>;
  open: (initialQuery?: string) => Promise<void>;
  close: () => void;
  setQuery: (query: string) => void;
  refresh: () => void;
  next: () => void;
  previous: () => void;
}

export function findLiteralMatches(text: string, query: string): DocumentSearchMatch[] {
  if (!query) return [];

  const source = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const matches: DocumentSearchMatch[] = [];
  let offset = 0;

  while (offset <= source.length - needle.length) {
    const found = source.indexOf(needle, offset);
    if (found === -1) break;
    matches.push({
      id: `${found}:${found + needle.length}`,
      index: matches.length,
      start: found,
      end: found + needle.length,
    });
    offset = found + Math.max(needle.length, 1);
  }

  return matches;
}

function toVisualMatches(matches: DocumentSearchMatch[], map: VisualTextMap): VisualSearchMatch[] {
  return matches.flatMap((match) => {
    const from = map.positions[match.start];
    const last = map.positions[match.end - 1];
    if (from == null || last == null) return [];
    return [{
      ...match,
      from,
      to: last + 1,
    }];
  });
}

export function useDocumentSearch(options: UseDocumentSearchOptions): UseDocumentSearchReturn {
  const state = ref<DocumentSearchState>({
    open: false,
    query: '',
    mode: options.getMode(),
    matches: [],
    activeIndex: -1,
  });

  const focusActiveMatch = () => {
    if (!state.value.open || state.value.activeIndex < 0) return;
    const match = state.value.matches[state.value.activeIndex];
    if (!match) return;

    if (state.value.mode === 'visual' && 'from' in match) {
      options.focusVisualMatch(match);
    } else {
      options.focusCodeMatch(match);
    }
  };

  const refresh = () => {
    const previousActiveId = state.value.matches[state.value.activeIndex]?.id;
    state.value.mode = options.getMode();

    if (!state.value.query) {
      state.value.matches = [];
      state.value.activeIndex = -1;
      options.clearVisualHighlights();
      return;
    }

    if (state.value.mode === 'visual') {
      const map = options.getVisualTextAndMap();
      const matches = map ? toVisualMatches(findLiteralMatches(map.text, state.value.query), map) : [];
      state.value.matches = matches;
      const previousIndex = previousActiveId
        ? matches.findIndex((match) => match.id === previousActiveId)
        : -1;
      state.value.activeIndex = matches.length === 0
        ? -1
        : previousIndex >= 0
          ? previousIndex
          : Math.min(Math.max(state.value.activeIndex, 0), matches.length - 1);
      options.applyVisualHighlights(matches, state.value.activeIndex);
      return;
    }

    options.clearVisualHighlights();
    const matches = findLiteralMatches(options.getCodeText(), state.value.query);
    state.value.matches = matches;
    const previousIndex = previousActiveId
      ? matches.findIndex((match) => match.id === previousActiveId)
      : -1;
    state.value.activeIndex = matches.length === 0
      ? -1
      : previousIndex >= 0
        ? previousIndex
        : Math.min(Math.max(state.value.activeIndex, 0), matches.length - 1);
  };

  const open = async (initialQuery?: string) => {
    state.value.open = true;
    if (initialQuery !== undefined && initialQuery.length > 0) {
      state.value.query = initialQuery;
      state.value.activeIndex = 0;
    }
    refresh();
    await Promise.resolve();
    options.focusSearchInput?.();
  };

  const close = () => {
    state.value.open = false;
    state.value.matches = [];
    state.value.activeIndex = -1;
    options.clearVisualHighlights();
    options.focusEditor?.();
  };

  const setQuery = (query: string) => {
    state.value.query = query;
    state.value.activeIndex = 0;
    refresh();
  };

  const next = () => {
    if (state.value.matches.length === 0) return;
    state.value.activeIndex = (state.value.activeIndex + 1 + state.value.matches.length) % state.value.matches.length;
    if (state.value.mode === 'visual') {
      options.applyVisualHighlights(state.value.matches as VisualSearchMatch[], state.value.activeIndex);
    }
    focusActiveMatch();
  };

  const previous = () => {
    if (state.value.matches.length === 0) return;
    state.value.activeIndex = (state.value.activeIndex - 1 + state.value.matches.length) % state.value.matches.length;
    if (state.value.mode === 'visual') {
      options.applyVisualHighlights(state.value.matches as VisualSearchMatch[], state.value.activeIndex);
    }
    focusActiveMatch();
  };

  return {
    state,
    open,
    close,
    setQuery,
    refresh,
    next,
    previous,
  };
}
