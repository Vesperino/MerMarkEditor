# Footnotes Test Document

## Basic Footnotes

This is a paragraph with a simple footnote[^1]. The reference appears as a superscript number.

Here is another paragraph with a named footnote[^note]. Named labels work too.

## Multiple References

You can use multiple footnotes[^2] in the same paragraph[^3]. They are numbered sequentially.

## Footnotes with Formatting

This paragraph references a footnote with **bold** text in the body[^4].

## Footnote in Context

Footnotes are commonly used in academic writing[^5], technical documentation[^2], and legal texts. Notice that [^2] is referenced twice.

## Edge Cases

### Inline Code

The syntax `[^1]` should not be converted when inside inline code.

### Code Block

```
[^1]: This is inside a code block and should NOT be treated as a footnote.
```

### Footnote-free Section

This section has no footnotes at all. It should render normally.

---

## Multi-line Definition

Check that multi-line footnote definitions are handled[^multi].

---

[^1]: This is the first footnote. Simple single-line definition.
[^note]: A footnote with a named label instead of a number.
[^2]: Second footnote, referenced multiple times in the document.
[^3]: Third footnote to verify sequential numbering.
[^4]: Footnote content can also contain **bold**, *italic*, and `code`.
[^5]: See: Markdown Extended Syntax, available at most Markdown parsers.
[^multi]: This is the first line of a multi-line footnote.
    This is a continuation line (indented by 4 spaces).
    And another continuation line.
