/**
 * Typora GitHub
 * GitHub: https://github.com/typora/typora-default-themes
 * Reference: https://github.com/typora/typora-default-themes/blob/cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2/themes/github.css
 * Revision: cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2
 * License: No upstream redistribution license established; reference only. Independent MerMark implementation (MIT).
 * Adaptation: normalized 16px body / 680px column; relative typography and spacing;
 * MerMark dark/code palettes. Upstream CSS and application fonts are not copied.
 */
import type { DocumentStyleDefinition } from './types';
const style: DocumentStyleDefinition = {
  "id": "typora-github",
  "label": "Typora GitHub",
  "fontFamily": "\"Open Sans\", Arial, sans-serif",
  "nativeFontSize": 16,
  "lineHeight": 1.6,
  "paragraphSpacing": 0.8,
  "headingLineHeight": 1.3,
  "headingSpaceBefore": 1.5,
  "headingSpaceAfter": 1,
  "headings": [
    {
      "size": 2.25,
      "weight": 700,
      "divider": true,
      "lineHeight": 1.2,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1.75,
      "weight": 700,
      "divider": true,
      "lineHeight": 1.225,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1.5,
      "weight": 700,
      "lineHeight": 1.43,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1.25,
      "weight": 700,
      "lineHeight": 1.4,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1,
      "weight": 700,
      "lineHeight": 1.4,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1,
      "weight": 700,
      "lineHeight": 1.4,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    }
  ],
  "light": {
    "background": "#ffffff",
    "text": "#1f2328",
    "muted": "#656d76",
    "border": "#d1d9e0",
    "link": "#0969da",
    "table": "#f6f8fa",
    "inlineCode": "#eff1f3"
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
    "reference": "https://github.com/typora/typora-default-themes/blob/cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2/themes/github.css",
    "revision": "cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2",
    "adaptation": "Independently implemented from the documented/visual reference; no upstream CSS redistributed."
  }
};
export default style;
