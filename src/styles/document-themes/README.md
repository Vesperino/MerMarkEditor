# Document themes

These style definitions and CSS files control document presentation, independently of Appearance themes in `../themes/`.

`index.ts` registers the seven styles, resolves bounded reading overrides, and converts metadata to scoped CSS variables. Each style has a separate definition and CSS file, with upstream references in both headers. `base.css` handles shared document elements. `print.ts` produces self-contained export CSS from the same definitions and licensed font assets. `useDocumentStyle` connects the registry to persisted app preferences.

See [comparison tool provenance](../../../tools/document-style-review/PROVENANCE.md) for pinned references, adaptations, and font notices. To add a style, add its ID and definition/CSS pair, register it, and include its provenance; the settings dropdown and comparison tool both read the registry.
