export const DOCUMENT_STYLE_IDS = ['github', 'obsidian-default', 'obsidian-minimal', 'typora-github', 'typora-newsprint', 'ia-helvetica', 'ia-palatino'] as const;
export type DocumentStyleId = typeof DOCUMENT_STYLE_IDS[number];
export interface DocumentStyleOverrides {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
  contentWidth?: number;
}
export interface HeadingStyle {
  size: number;
  lineHeight?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  weight: number;
  italic?: boolean;
  caps?: 'small-caps' | 'uppercase';
  muted?: boolean;
  divider?: boolean;
}
export interface DocumentPalette { background: string; text: string; muted: string; border: string; link: string; table: string; inlineCode: string }
export interface DocumentStyleDefinition {
  id: DocumentStyleId;
  label: string;
  fontFamily: string;
  nativeFontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  headingLineHeight: number;
  headingSpaceBefore: number;
  headingSpaceAfter: number;
  headings: HeadingStyle[];
  quoteItalic?: boolean;
  runInH6?: boolean;
  light: DocumentPalette;
  dark: DocumentPalette;
  source: { license: string; github: string; reference: string; revision: string; adaptation: string };
}
export interface ResolvedDocumentStyle extends DocumentStyleDefinition {
  fontSize: number;
  contentWidth: number;
  palette: DocumentPalette;
  codeFontFamily: string;
  codeDark: boolean;
  codeWordWrap: boolean;
}
