import { computed } from 'vue';
import { useSettings, EDITOR_FONTS, CODE_FONTS } from './useSettings';
import { resolveDocumentStyle } from '../styles/document-themes';
/** Exports pass 'light': a dark page palette would print as light text on white paper. */
export function useDocumentStyle(mode?: 'light' | 'dark') {
  const { settings } = useSettings();
  return computed(() => {
    const s = settings.value;
    const overrides = { ...s.documentStyleOverrides[s.documentStyle] };
    if (overrides.fontFamily) overrides.fontFamily = EDITOR_FONTS.find(f => f.id === overrides.fontFamily)?.fontFamily ?? `"${overrides.fontFamily.replace(/["\\]/g, '')}", sans-serif`;
    return { ...resolveDocumentStyle(s.documentStyle, overrides, mode ?? s.theme), codeFontFamily: CODE_FONTS.find(f => f.id === s.codeFontFamily)?.fontFamily ?? `"${s.codeFontFamily.replace(/["\\]/g, '')}", monospace`, codeDark: s.codeTheme === 'dark', codeWordWrap: s.codeWordWrap };
  });
}
