# Document style provenance

All document styles are independently implemented in MerMark under its MIT license. Names identify design references; they do not claim affiliation or exact reproduction of the upstream application. No extracted Obsidian application CSS or fonts are included.

| Style | GitHub project | Actual reference | Revision |
| --- | --- | --- | --- |
| Typora GitHub | [typora/typora-default-themes](https://github.com/typora/typora-default-themes) | [Reference](https://github.com/typora/typora-default-themes/blob/cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2/themes/github.css) | cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2 |
| GitHub | [sindresorhus/github-markdown-css](https://github.com/sindresorhus/github-markdown-css) | [Reference](https://github.com/sindresorhus/github-markdown-css/blob/7f38dcb9054bc5d860fac65291f5c98fef47932c/github-markdown-light.css) | 7f38dcb9054bc5d860fac65291f5c98fef47932c |
| Typora Newsprint | [typora/typora-default-themes](https://github.com/typora/typora-default-themes) | [Reference](https://github.com/typora/typora-default-themes/blob/cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2/themes/newsprint.css) | cf4f2cb7e81a73050456367cfdfdb80b5a14a7b2 |
| iA Writer Palatino | [iainc/iA-Writer-Templates](https://github.com/iainc/iA-Writer-Templates) | [Reference](https://files.ia.net/writer/templates/Palatino-1.1.zip) | Palatino 1.1; repository 6b4c61703b377fe9970cdffdc68e505bea24d2ef |
| Obsidian Default | [obsidianmd/obsidian-developer-docs](https://github.com/obsidianmd/obsidian-developer-docs) | [Reference](https://github.com/obsidianmd/obsidian-developer-docs/blob/13e7fccd0b45178e9ef9855edc48bce35fc0eb75/en/Reference/CSS%20variables/Editor/Headings.md) | Obsidian 1.13.7 visual reference; documentation 13e7fccd0b45178e9ef9855edc48bce35fc0eb75 |
| Obsidian Minimal | [kepano/obsidian-minimal](https://github.com/kepano/obsidian-minimal) | [Reference](https://github.com/kepano/obsidian-minimal/blob/ccc832cff341a79b5ba7bca162e053312bafc293/Minimal.css) | ccc832cff341a79b5ba7bca162e053312bafc293 |
| iA Writer Helvetica | [iainc/iA-Writer-Templates](https://github.com/iainc/iA-Writer-Templates) | [Reference](https://files.ia.net/writer/templates/Helvetica-1.1.zip) | Helvetica 1.1; repository 6b4c61703b377fe9970cdffdc68e505bea24d2ef |

## Implementation choices

GitHub and Minimal reference MIT projects. Obsidian Default follows documented CSS variables and the visually reviewed Obsidian 1.13.7 heading hierarchy; the closed-source base stylesheet is not redistributed. Typora references its published theme files; no upstream redistribution license was established, so its assets and CSS are not copied. No redistribution license was established for the iA template bundles either. iA Helvetica and Palatino refer to the official downloadable 1.1 templates; the public templates repository is related project context, not the source of those template files.

The comparison normalizes body size and reading width to 16px/680px. Each style retains its font stack, heading size/weight/emphasis, body line height, and paragraph spacing. Layout and unsupported application-specific features are adapted to MerMark. Dark palettes use MerMark-compatible document colors. Code backgrounds and syntax colors follow the independent Code Light/Dark preference.

## Bundled fonts

Open Sans and PT Serif come from [google/fonts at 9710da1eacb3be272583c3224dcb70f9da6eadbb](https://github.com/google/fonts/tree/9710da1eacb3be272583c3224dcb70f9da6eadbb/ofl). Their SIL Open Font License texts are retained in `src/styles/document-themes/fonts/OFL-OpenSans.txt` and `OFL-PTSerif.txt`. Open Sans includes variable regular/italic files; PT Serif includes regular, bold, italic, and bold italic. Helvetica/Palatino and system stacks use installed fonts with fallbacks.
