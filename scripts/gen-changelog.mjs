#!/usr/bin/env node
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

const ROOT = cwd();
const NOTES_DIR = resolve(ROOT, 'docs', 'release-notes');
const OUT = resolve(ROOT, 'CHANGELOG.md');

const VERSION_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

function compare(a, b) {
  const ma = a.match(VERSION_RE);
  const mb = b.match(VERSION_RE);
  for (let i = 1; i <= 3; i++) {
    const da = Number(ma[i]);
    const db = Number(mb[i]);
    if (da !== db) return db - da;
  }
  return 0;
}

async function collect() {
  if (!existsSync(NOTES_DIR)) return [];
  const folders = await readdir(NOTES_DIR);
  const entries = [];
  for (const folder of folders) {
    if (!VERSION_RE.test(folder)) continue;
    const file = join(NOTES_DIR, folder, 'RELEASE_NOTES.md');
    try {
      const s = await stat(file);
      if (!s.isFile()) continue;
    } catch {
      continue;
    }
    entries.push({ folder, markdown: await readFile(file, 'utf8') });
  }
  return entries.sort((a, b) => compare(a.folder, b.folder));
}

function render(entries) {
  const header =
    '# Changelog\n\n> Auto-generated from docs/release-notes/. Run `pnpm gen:changelog` after editing.\n\n---\n\n';
  const body = entries
    .map(({ markdown }) => markdown.replace(/\s+$/g, ''))
    .join('\n\n---\n\n');
  return `${header}${body}\n`;
}

async function main() {
  const entries = await collect();
  const desired = render(entries);
  const check = argv.includes('--check');
  if (check) {
    let actual = '';
    try {
      actual = await readFile(OUT, 'utf8');
    } catch {
      // missing
    }
    if (actual === desired) {
      exit(0);
    }
    console.error('CHANGELOG.md is out of date. Run `pnpm gen:changelog`.');
    exit(1);
  }
  await writeFile(OUT, desired, 'utf8');
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
