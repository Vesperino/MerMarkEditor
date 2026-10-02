/**
 * Obsidian Default
 * GitHub: https://github.com/obsidianmd/obsidian-developer-docs
 * Reference: https://github.com/obsidianmd/obsidian-developer-docs/blob/13e7fccd0b45178e9ef9855edc48bce35fc0eb75/en/Reference/CSS%20variables/Editor/Headings.md
 * Revision: Obsidian 1.13.7 visual reference; documentation 13e7fccd0b45178e9ef9855edc48bce35fc0eb75
 * License: Obsidian application stylesheet is proprietary and is not redistributed; independent MerMark implementation (MIT).
 * Adaptation: normalized 16px body / 680px column; relative typography and spacing;
 * MerMark dark/code palettes. Upstream CSS and application fonts are not copied.
 */
import type { DocumentStyleDefinition } from './types';
const style: DocumentStyleDefinition = {
  "id": "obsidian-default",
  "label": "Obsidian Default",
  "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Arial, sans-serif",
  "nativeFontSize": 16,
  "lineHeight": 1.5,
  "paragraphSpacing": 1,
  "headingLineHeight": 1.3,
  "headingSpaceBefore": 1.5,
  "headingSpaceAfter": 1,
  "headings": [
    {
      "size": 1.618,
      "weight": 700,
      "lineHeight": 1.2,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1.462,
      "weight": 680,
      "lineHeight": 1.2,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1.318,
      "weight": 660,
      "lineHeight": 1.3,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1.188,
      "weight": 640,
      "lineHeight": 1.4,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1.076,
      "weight": 620,
      "lineHeight": 1.5,
      "spaceBefore": 1.0,
      "spaceAfter": 1.0
    },
    {
      "size": 1,
      "weight": 600,
      "lineHeight": 1.5,
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
    "license": "Obsidian application stylesheet is proprietary and is not redistributed; independent MerMark implementation (MIT).",
    "github": "https://github.com/obsidianmd/obsidian-developer-docs",
    "reference": "https://github.com/obsidianmd/obsidian-developer-docs/blob/13e7fccd0b45178e9ef9855edc48bce35fc0eb75/en/Reference/CSS%20variables/Editor/Headings.md",
    "revision": "Obsidian 1.13.7 visual reference; documentation 13e7fccd0b45178e9ef9855edc48bce35fc0eb75",
    "adaptation": "Independently implemented from the documented/visual reference; no upstream CSS redistributed."
  }
};
export default style;
