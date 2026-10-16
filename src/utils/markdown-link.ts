/** Allow Markdown paths and anchors alongside the link extension's validated
 * URI schemes. Strip browser-ignored whitespace before checking for a scheme. */
export function isAllowedMarkdownLink(url: string, context: { defaultValidate: (url: string) => boolean }): boolean {
  const compact = url.replace(/[\s\u0000-\u001f\u007f-\u009f]/g, '');
  return !/^[a-z][a-z0-9+.-]*:/i.test(compact) || context.defaultValidate(url);
}
