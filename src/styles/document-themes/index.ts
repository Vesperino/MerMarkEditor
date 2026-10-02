import './base.css';
import './fonts.css';
import github from './github';
import './github.css';
import obsidianDefault from './obsidian-default';
import './obsidian-default.css';
import obsidianMinimal from './obsidian-minimal';
import './obsidian-minimal.css';
import typoraGithub from './typora-github';
import './typora-github.css';
import typoraNewsprint from './typora-newsprint';
import './typora-newsprint.css';
import iaHelvetica from './ia-helvetica';
import './ia-helvetica.css';
import iaPalatino from './ia-palatino';
import './ia-palatino.css';
import { DOCUMENT_STYLE_IDS, type DocumentStyleId, type DocumentStyleOverrides, type ResolvedDocumentStyle } from './types';
export type { DocumentStyleId, DocumentStyleOverrides, ResolvedDocumentStyle } from './types';
export const DOCUMENT_STYLES = [github, obsidianDefault, obsidianMinimal, typoraGithub, typoraNewsprint, iaHelvetica, iaPalatino];
export function isDocumentStyleId(value: unknown): value is DocumentStyleId {
  return DOCUMENT_STYLE_IDS.includes(value as DocumentStyleId);
}
export const OVERRIDE_LIMITS = { fontSize: [10, 32, 1], lineHeight: [1, 2.5, .05], paragraphSpacing: [0, 3, .05], contentWidth: [320, 1400, 20] } as const;
export function normalizeOverrides(value: unknown): DocumentStyleOverrides {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const out: DocumentStyleOverrides = {};
  if (typeof input.fontFamily === 'string' && input.fontFamily.trim()) out.fontFamily = input.fontFamily.trim();
  for (const key of Object.keys(OVERRIDE_LIMITS) as (keyof typeof OVERRIDE_LIMITS)[]) {
    const n = input[key];
    if (typeof n === 'number' && Number.isFinite(n)) {
      const [min, max] = OVERRIDE_LIMITS[key];
      out[key] = Math.max(min, Math.min(max, n));
    }
  }
  return out;
}
export function resolveDocumentStyle(id: unknown = 'github', overrides: DocumentStyleOverrides = {}, mode: 'light' | 'dark' = 'light'): ResolvedDocumentStyle {
  const definition = DOCUMENT_STYLES.find(style => style.id === id) ?? DOCUMENT_STYLES[0];
  return { ...definition, fontSize: 16, contentWidth: 680, ...normalizeOverrides(overrides), palette: { ...definition[mode] }, codeFontFamily: '"Fira Code", Consolas, monospace', codeDark: true, codeWordWrap: true };
}
export function documentStyleVariables(style: ResolvedDocumentStyle): Record<string, string> {
  const vars: Record<string, string> = {
    '--doc-font-family': style.fontFamily, '--doc-font-size': `${style.fontSize}px`,
    '--doc-line-height': String(style.lineHeight), '--doc-paragraph-space': String(style.paragraphSpacing),
    '--doc-content-width': `${style.contentWidth}px`, '--doc-heading-line-height': String(style.headingLineHeight),
    '--doc-heading-before': String(style.headingSpaceBefore), '--doc-heading-after': String(style.headingSpaceAfter),
    '--doc-quote-style': style.quoteItalic ? 'italic' : 'normal',
    '--code-font-family': style.codeFontFamily,
    '--code-block-bg': style.codeDark ? '#0f172a' : '#f8fafc',
    '--code-block-text': style.codeDark ? '#e2e8f0' : '#1e293b',
    '--doc-code-white-space': style.codeWordWrap ? 'pre-wrap' : 'pre',
  };
  for (const [key, value] of Object.entries(style.palette)) vars[`--doc-${key}`] = value;
  const syntax = style.codeDark ? ['#c678dd','#e06c75','#98c379','#61afef','#d19a66','#94a3b8'] : ['#7c3aed','#dc2626','#15803d','#2563eb','#a16207','#64748b'];
  ['keyword','name','string','function','number','comment'].forEach((key, i) => vars[`--code-preview-${key}`] = syntax[i]);
  style.headings.forEach((heading, index) => {
    const p = `--doc-h${index + 1}`;
    vars[`${p}-line-height`] = String(heading.lineHeight ?? style.headingLineHeight);
    vars[`${p}-before`] = String(heading.spaceBefore ?? style.headingSpaceBefore);
    vars[`${p}-after`] = String(heading.spaceAfter ?? style.headingSpaceAfter);
    vars[`${p}-size`] = String(heading.size); vars[`${p}-weight`] = String(heading.weight);
    vars[`${p}-style`] = heading.italic ? 'italic' : 'normal';
    vars[`${p}-variant`] = heading.caps === 'small-caps' ? 'small-caps' : 'normal';
    vars[`${p}-transform`] = heading.caps === 'uppercase' ? 'uppercase' : 'none';
    vars[`${p}-color`] = heading.muted ? style.palette.muted : style.palette.text;
    vars[`${p}-border`] = heading.divider ? '1px' : '0px';
    vars[`${p}-padding`] = heading.divider ? '.3em' : '0';
  });
  return vars;
}
