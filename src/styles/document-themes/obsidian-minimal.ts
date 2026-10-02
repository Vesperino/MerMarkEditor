/**
 * Obsidian Minimal
 * GitHub: https://github.com/kepano/obsidian-minimal
 * Reference: https://github.com/kepano/obsidian-minimal/blob/ccc832cff341a79b5ba7bca162e053312bafc293/Minimal.css
 * Revision: ccc832cff341a79b5ba7bca162e053312bafc293
 * License: MIT reference; independent MerMark implementation (MIT).
 * Adaptation: normalized 16px body / 680px column; relative typography and spacing;
 * MerMark dark/code palettes. Upstream CSS and application fonts are not copied.
 */
import type { DocumentStyleDefinition } from './types';
const style: DocumentStyleDefinition = {
  "id": "obsidian-minimal",
  "label": "Obsidian Minimal",
  "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Arial, sans-serif",
  "nativeFontSize": 16,
  "lineHeight": 1.5,
  "paragraphSpacing": 1.75,
  "headingLineHeight": 1.3,
  "headingSpaceBefore": 1.5,
  "headingSpaceAfter": 1,
  "headings": [
    {
      "size": 1.125,
      "weight": 600,
      "lineHeight": 1.2,
      "spaceBefore": 1.75,
      "spaceAfter": 1.75
    },
    {
      "size": 1.05,
      "weight": 600,
      "lineHeight": 1.2,
      "spaceBefore": 1.75,
      "spaceAfter": 1.75
    },
    {
      "size": 1,
      "weight": 500,
      "lineHeight": 1.3,
      "spaceBefore": 1.75,
      "spaceAfter": 1.75
    },
    {
      "size": 0.9,
      "weight": 500,
      "lineHeight": 1.4,
      "spaceBefore": 1.75,
      "spaceAfter": 1.75
    },
    {
      "size": 0.85,
      "weight": 500,
      "caps": "small-caps",
      "lineHeight": 1.5,
      "spaceBefore": 1.75,
      "spaceAfter": 1.75
    },
    {
      "size": 0.85,
      "weight": 400,
      "caps": "small-caps",
      "lineHeight": 1.5,
      "spaceBefore": 1.75,
      "spaceAfter": 1.75
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
    "github": "https://github.com/kepano/obsidian-minimal",
    "reference": "https://github.com/kepano/obsidian-minimal/blob/ccc832cff341a79b5ba7bca162e053312bafc293/Minimal.css",
    "revision": "ccc832cff341a79b5ba7bca162e053312bafc293",
    "adaptation": "Independently implemented from the documented/visual reference; no upstream CSS redistributed."
  }
};
export default style;
