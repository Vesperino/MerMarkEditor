/// <reference lib="webworker" />
import { extractMarkdownToc } from '../utils/markdown-toc';

self.onmessage = (event: MessageEvent<{ id: number; markdown: string }>) => {
  self.postMessage({ id: event.data.id, items: extractMarkdownToc(event.data.markdown) });
};

export {};
