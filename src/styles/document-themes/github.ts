/**
 * GitHub
 * GitHub: https://github.com/sindresorhus/github-markdown-css
 * Reference: https://github.com/sindresorhus/github-markdown-css/blob/7f38dcb9054bc5d860fac65291f5c98fef47932c/github-markdown-light.css
 * Revision: 7f38dcb9054bc5d860fac65291f5c98fef47932c
 * License: MIT reference; independent MerMark implementation (MIT).
 * Adaptation: normalized 16px body / 680px column; relative typography and spacing;
 * MerMark dark/code palettes. Upstream CSS and application fonts are not copied.
 */
import type { DocumentStyleDefinition } from './types';
const style: DocumentStyleDefinition = {
  "id": "github",
  "label": "GitHub",
  "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Arial, sans-serif",
  "nativeFontSize": 16,
  "lineHeight": 1.5,
  "paragraphSpacing": 1,
  "headingLineHeight": 1.25,
  "headingSpaceBefore": 1.5,
  "headingSpaceAfter": 1,
  "headings": [
    {
      "size": 2,
      "weight": 600,
      "divider": true,
      "lineHeight": 1.25,
      "spaceBefore": 1.5,
      "spaceAfter": 1.0
    },
    {
      "size": 1.5,
      "weight": 600,
      "divider": true,
      "lineHeight": 1.25,
      "spaceBefore": 1.5,
      "spaceAfter": 1.0
    },
    {
      "size": 1.25,
      "weight": 600,
      "lineHeight": 1.25,
      "spaceBefore": 1.5,
      "spaceAfter": 1.0
    },
    {
      "size": 1,
      "weight": 600,
      "lineHeight": 1.25,
      "spaceBefore": 1.5,
      "spaceAfter": 1.0
    },
    {
      "size": 0.875,
      "weight": 600,
      "lineHeight": 1.25,
      "spaceBefore": 1.5,
      "spaceAfter": 1.0
    },
    {
      "size": 0.85,
      "weight": 600,
      "muted": true,
      "lineHeight": 1.25,
      "spaceBefore": 1.5,
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
    "license": "MIT reference; independent MerMark implementation (MIT).",
    "github": "https://github.com/sindresorhus/github-markdown-css",
    "reference": "https://github.com/sindresorhus/github-markdown-css/blob/7f38dcb9054bc5d860fac65291f5c98fef47932c/github-markdown-light.css",
    "revision": "7f38dcb9054bc5d860fac65291f5c98fef47932c",
    "adaptation": "Independently implemented from the documented/visual reference; no upstream CSS redistributed."
  }
};
export default style;
