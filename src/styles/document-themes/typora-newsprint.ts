/**
 * Typora Newsprint
 * GitHub: https://github.com/typora/typora-default-themes
 * Reference: https://github.com/typora/typora-default-themes/blob/cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2/themes/newsprint.css
 * Revision: cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2
 * License: No upstream redistribution license established; reference only. Independent MerMark implementation (MIT).
 * Adaptation: normalized 16px body / 680px column; relative typography and spacing;
 * MerMark dark/code palettes. Upstream CSS and application fonts are not copied.
 */
import type { DocumentStyleDefinition } from './types';
const style: DocumentStyleDefinition = {
  "id": "typora-newsprint",
  "label": "Typora Newsprint",
  "fontFamily": "\"PT Serif\", Georgia, serif",
  "nativeFontSize": 16,
  "lineHeight": 1.5,
  "paragraphSpacing": 1.5,
  "headingLineHeight": 1.3,
  "headingSpaceBefore": 1.5,
  "headingSpaceAfter": 1,
  "headings": [
    {
      "size": 1.875,
      "weight": 400,
      "lineHeight": 1.3,
      "spaceBefore": 3.75,
      "spaceAfter": 0.9375
    },
    {
      "size": 1.3125,
      "weight": 700,
      "lineHeight": 1.15,
      "spaceBefore": 3.0,
      "spaceAfter": 0.984375
    },
    {
      "size": 1.3125,
      "weight": 400,
      "lineHeight": 1.15,
      "spaceBefore": 3.0,
      "spaceAfter": 0.984375
    },
    {
      "size": 1.125,
      "weight": 700,
      "lineHeight": 1.333333,
      "spaceBefore": 3.00375,
      "spaceAfter": 1.6875
    },
    {
      "size": 1,
      "weight": 700,
      "lineHeight": 1.5,
      "spaceBefore": 1.67,
      "spaceAfter": 1.5
    },
    {
      "size": 1,
      "weight": 700,
      "lineHeight": 1.5,
      "spaceBefore": 2.33,
      "spaceAfter": 1.5
    }
  ],
  "light": {
    "background": "#f3f2ee",
    "text": "#1f0909",
    "muted": "#656d76",
    "border": "#d1d9e0",
    "link": "#065588",
    "table": "#e9e7e1",
    "inlineCode": "#e7e5df"
  },
  "dark": {
    "background": "#0d1117",
    "text": "#e6edf3",
    "muted": "#9da7b3",
    "border": "#30363d",
    "link": "#58a6ff",
    "table": "#161b22",
    "inlineCode": "#262c36"
  },
  "source": {
    "license": "No upstream redistribution license established; reference only. Independent MerMark implementation (MIT).",
    "github": "https://github.com/typora/typora-default-themes",
    "reference": "https://github.com/typora/typora-default-themes/blob/cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2/themes/newsprint.css",
    "revision": "cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2",
    "adaptation": "Independently implemented from the documented/visual reference; no upstream CSS redistributed."
  },
  "quoteItalic": true
};
export default style;
