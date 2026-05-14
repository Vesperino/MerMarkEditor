// Vitest setup file
// Mock localStorage before any imports
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string): string | null {
    return this.store[key] || null;
  },
  setItem(key: string, value: string): void {
    this.store[key] = value;
  },
  removeItem(key: string): void {
    delete this.store[key];
  },
  clear(): void {
    this.store = {};
  },
  get length(): number {
    return Object.keys(this.store).length;
  },
  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  },
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Register custom tooltip directive globally so components using `v-tooltip`
// mount without warnings. Production tooltip sets data-tooltip-text on the
// element; tests query via that attribute.
import { config } from '@vue/test-utils';
import { vTooltip } from './src/directives/tooltip';
config.global.directives = {
  ...(config.global.directives ?? {}),
  tooltip: vTooltip,
};
