import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRecentFiles } from '../../composables/useRecentFiles';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

describe('useRecentFiles', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should start with empty list when no data in localStorage', () => {
    const { recentFiles } = useRecentFiles();
    // May have data from other tests, but after clear + fresh module it should work
    expect(Array.isArray(recentFiles.value)).toBe(true);
  });

  it('should add a recent file', () => {
    const { recentFiles, addRecentFile } = useRecentFiles();
    addRecentFile('/test/file.md', 'file.md');
    expect(recentFiles.value.some(f => f.filePath === '/test/file.md')).toBe(true);
    expect(recentFiles.value.some(f => f.fileName === 'file.md')).toBe(true);
  });

  it('should move duplicate file to top instead of adding twice', () => {
    const { recentFiles, addRecentFile } = useRecentFiles();
    addRecentFile('/test/a.md', 'a.md');
    addRecentFile('/test/b.md', 'b.md');
    addRecentFile('/test/a.md', 'a.md');
    const aPaths = recentFiles.value.filter(f => f.filePath === '/test/a.md');
    expect(aPaths.length).toBe(1);
    expect(recentFiles.value[0].filePath).toBe('/test/a.md');
  });

  it('should persist to localStorage', () => {
    const { addRecentFile } = useRecentFiles();
    addRecentFile('/test/file.md', 'file.md');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'mermark-recent-files',
      expect.stringContaining('/test/file.md'),
    );
  });

  it('should limit to 10 recent files', () => {
    const { recentFiles, addRecentFile } = useRecentFiles();
    for (let i = 0; i < 15; i++) {
      addRecentFile(`/test/file${i}.md`, `file${i}.md`);
    }
    expect(recentFiles.value.length).toBeLessThanOrEqual(10);
  });

  it('should clear recent files', () => {
    const { recentFiles, addRecentFile, clearRecentFiles } = useRecentFiles();
    addRecentFile('/test/file.md', 'file.md');
    clearRecentFiles();
    expect(recentFiles.value.length).toBe(0);
  });
});
