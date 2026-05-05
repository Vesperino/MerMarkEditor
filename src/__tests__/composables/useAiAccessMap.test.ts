import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/aiCommands', () => ({
  aiCommands: {
    accessLoad: vi.fn(),
    accessSave: vi.fn(),
    accessMigrate: vi.fn(),
  },
}));

import { aiCommands } from '../../services/aiCommands';
import { useAiAccessMap } from '../../composables/useAiAccessMap';

const mockLoad = aiCommands.accessLoad as unknown as { mockResolvedValue: (v: unknown) => void };
const mockSave = aiCommands.accessSave as unknown as { mockResolvedValue: (v: unknown) => void };

describe('useAiAccessMap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loadFor stores docPath and current map', async () => {
    mockLoad.mockResolvedValue({ readPaths: ['/x'], writePaths: ['/x'], tools: { bash: false, network: false, fileRead: false, fileWrite: false } });
    const { loadFor, current, docPath } = useAiAccessMap();
    await loadFor('/x');
    expect(docPath.value).toBe('/x');
    expect(current.value?.readPaths).toEqual(['/x']);
  });

  it('save throws when no doc loaded', async () => {
    const { save } = useAiAccessMap();
    await expect(save({} as never)).rejects.toThrow();
  });

  it('save persists and updates current', async () => {
    mockLoad.mockResolvedValue({ readPaths: [], writePaths: [], tools: { bash: false, network: false, fileRead: false, fileWrite: false } });
    mockSave.mockResolvedValue(undefined);
    const { loadFor, save, current } = useAiAccessMap();
    await loadFor('/x');
    const next = { readPaths: ['/y'], writePaths: ['/x'], tools: { bash: true, network: false, fileRead: false, fileWrite: false } };
    await save(next);
    expect(current.value).toEqual(next);
    expect(aiCommands.accessSave).toHaveBeenCalledWith('/x', next);
  });
});
