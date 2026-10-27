// Deliberately repeated: anchors must retain occurrence order, even when a
// paragraph's source spelling differs from its visually identical neighbors.
export function buildSaveDocument(kind: string, size: number, handbook: string): string {
  const chunks: Record<string, string> = {
    handbook: handbook + '\n',
    wrapped: 'a b c d e\nf g h i j\nk l m n o\np q r s t\nu v w x y\n\n',
    markers: '- __same__ item\n- _second_ item\n\n> same quoted\n> wrapped text\n\n',
    repeated: 'same\nparagraph\n\nsame paragraph\n\nsame\nparagraph\n\n',
    html: 'Before <strong>strong</strong> text\nwrapped words\n\n',
  };
  const chunk = chunks[kind];
  return chunk.repeat(Math.ceil(size / chunk.length));
}
