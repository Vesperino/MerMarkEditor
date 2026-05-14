export interface ReleaseEntry {
  version: string;
  tag: string;
  title: string;
  markdown: string;
}

const VERSION_FROM_PATH = /\/v(\d+\.\d+\.\d+)\/RELEASE_NOTES\.md$/;
const HEADING = /^#\s+Release\s+v(\d+\.\d+\.\d+)(?:\s+[—-]\s+(.+))?\s*$/m;

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function parseEntry(path: string, markdown: string): ReleaseEntry | null {
  const match = path.match(VERSION_FROM_PATH);
  if (!match) return null;
  const version = match[1];
  const heading = markdown.match(HEADING);
  const title = heading?.[2]?.trim() || `v${version}`;
  return { version, tag: `v${version}`, title, markdown };
}

export function sortEntriesDesc(entries: ReleaseEntry[]): ReleaseEntry[] {
  return [...entries].sort((a, b) => compareVersions(b.version, a.version));
}

export function selectCurrent(entries: ReleaseEntry[], version: string): ReleaseEntry | null {
  return entries.find((e) => e.version === version) ?? null;
}

const eagerModules = import.meta.glob(
  '../../docs/release-notes/v*/RELEASE_NOTES.md',
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>;

let cachedEntries: ReleaseEntry[] | null = null;

export function getAll(): ReleaseEntry[] {
  if (cachedEntries) return cachedEntries;
  const parsed: ReleaseEntry[] = [];
  for (const [path, markdown] of Object.entries(eagerModules)) {
    const entry = parseEntry(path, markdown);
    if (entry) parsed.push(entry);
  }
  cachedEntries = sortEntriesDesc(parsed);
  return cachedEntries;
}

export function getCurrent(version: string): ReleaseEntry | null {
  return selectCurrent(getAll(), version);
}
