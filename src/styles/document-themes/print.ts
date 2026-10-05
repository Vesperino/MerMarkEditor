import { reactive } from 'vue';
import baseCss from './base.css?raw';
import fontCss from './fonts.css?raw';
import { documentStyleVariables, type ResolvedDocumentStyle } from './index';
const themeCss = import.meta.glob<string>('./*.css', { eager: true, query: '?raw', import: 'default' });
const fontLoaders = import.meta.glob<string>('./fonts/*.ttf', { query: '?inline', import: 'default' });
const fontData = reactive<Record<string, string>>({});
let fontsLoading: Promise<void> | null = null;
/** Inlines the bundled fonts on first export so the 2.5 MB of base64 stays out of the startup bundle. */
export function loadPrintFonts(): Promise<void> {
  fontsLoading ??= Promise.all(Object.entries(fontLoaders).map(async ([path, load]) => { fontData[path] = await load(); })).then(() => undefined);
  return fontsLoading;
}
/** Self-contained styles: native print windows cannot load the app's asset URLs. */
export function documentPrintCss(style: ResolvedDocumentStyle, headingFont = style.fontFamily): string {
  const fonts = fontCss.split('\n').filter(line => !line.startsWith('@font-face') || [style.fontFamily, headingFont].some(f => line.includes(`font-family: "${f.includes('Open Sans') ? 'Open Sans' : f.includes('PT Serif') ? 'PT Serif' : '__unused__'}"`))).join('\n').replace(/url\("([^"]+)"\)/g, (_match, path: string) => `url("${fontData[path] ?? path}")`);
  const safe = (value: string) => value.replace(/[<>;{}]/g, '');
  const vars = { ...documentStyleVariables(style), '--doc-heading-font-family': headingFont };
  const declarations = Object.entries(vars).map(([key, value]) => `${key}: ${safe(value)};`).join('\n');
  return `${fonts}\n${baseCss}\n${themeCss[`./${style.id}.css`] ?? ''}\n.document-root { ${declarations} }`;
}
