/**
 * iA Writer Palatino
 * GitHub: https://github.com/iainc/iA-Writer-Templates
 * Reference: https://files.ia.net/writer/templates/Palatino-1.1.zip
 * Revision: Palatino 1.1; repository 6b4c61703b377fe9970cdffdc68e505bea24d2ef
 * License: No template redistribution license established; reference only. Independent MerMark implementation (MIT).
 * Adaptation: normalized 16px body / 680px column; relative typography and spacing;
 * MerMark dark/code palettes. Upstream CSS and application fonts are not copied.
 */
import type { DocumentStyleDefinition } from './types';
const style: DocumentStyleDefinition = {
  "id": "ia-palatino",
  "label": "iA Writer Palatino",
  "fontFamily": "Palatino, \"Palatino Linotype\", \"Book Antiqua\", Georgia, serif",
  "nativeFontSize": 15,
  "lineHeight": 1.631578947368421,
  "paragraphSpacing": 1.631578947368421,
  "headingLineHeight": 1.3,
  "headingSpaceBefore": 1.5,
  "headingSpaceAfter": 1,
  "headings": [
    {
      "size": 1.2105263157894737,
      "weight": 600,
      "lineHeight": 1.347829,
      "spaceBefore": 3.263156,
      "spaceAfter": 3.263156
    },
    {
      "size": 1.105263157894737,
      "weight": 600,
      "lineHeight": 1.476193,
      "spaceBefore": 3.263156,
      "spaceAfter": 1.631581
    },
    {
      "size": 1,
      "weight": 600,
      "lineHeight": 1.631581,
      "spaceBefore": 1.631581,
      "spaceAfter": 0
    },
    {
      "size": 1,
      "weight": 600,
      "italic": true,
      "lineHeight": 1.631581,
      "spaceBefore": 1.631581,
      "spaceAfter": 0
    },
    {
      "size": 1,
      "weight": 700,
      "caps": "uppercase",
      "lineHeight": 1.631581,
      "spaceBefore": 1.631581,
      "spaceAfter": 0
    },
    {
      "size": 1,
      "weight": 700,
      "caps": "uppercase",
      "lineHeight": 1.631581,
      "spaceBefore": 1.631581,
      "spaceAfter": 0
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
    "license": "No template redistribution license established; reference only. Independent MerMark implementation (MIT).",
    "github": "https://github.com/iainc/iA-Writer-Templates",
    "reference": "https://files.ia.net/writer/templates/Palatino-1.1.zip",
    "revision": "Palatino 1.1; repository 6b4c61703b377fe9970cdffdc68e505bea24d2ef",
    "adaptation": "Independently implemented from the documented/visual reference; no upstream CSS redistributed."
  },
  "runInH6": true
};
export default style;
