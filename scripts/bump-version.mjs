#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

const ROOT = cwd();
const PACKAGE_JSON = resolve(ROOT, 'package.json');
const TAURI_CONF = resolve(ROOT, 'src-tauri', 'tauri.conf.json');
const CARGO_TOML = resolve(ROOT, 'src-tauri', 'Cargo.toml');
const GEN_CHANGELOG = resolve(ROOT, 'scripts', 'gen-changelog.mjs');

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const BUMP_TYPES = new Set(['patch', 'minor', 'major']);

function parseArgs() {
  const args = argv.slice(2);
  if (args.length === 0 || !BUMP_TYPES.has(args[0])) {
    console.error('usage: bump-version.mjs <patch|minor|major> [--current X.Y.Z]');
    exit(1);
  }
  const type = args[0];
  let current = null;
  const idx = args.indexOf('--current');
  if (idx >= 0 && args[idx + 1]) current = args[idx + 1];
  return { type, current };
}

function stripV(s) {
  return s.startsWith('v') ? s.slice(1) : s;
}

function resolveCurrent(explicit) {
  if (explicit) return stripV(explicit);
  try {
    const tag = execFileSync(
      'gh',
      ['release', 'list', '--limit', '1', '--json', 'tagName', '--jq', '.[0].tagName'],
      { encoding: 'utf8' },
    ).trim();
    if (VERSION_RE.test(stripV(tag))) return stripV(tag);
  } catch {
    // gh not available or no releases
  }
  try {
    const tag = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      encoding: 'utf8',
    }).trim();
    if (VERSION_RE.test(stripV(tag))) return stripV(tag);
  } catch {
    // no tags
  }
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    if (VERSION_RE.test(pkg.version)) {
      console.warn('warning: falling back to package.json version (no tag found)');
      return pkg.version;
    }
  } catch {
    // ignore
  }
  console.error('could not resolve current version');
  exit(1);
  return null;
}

function nextVersion(current, type) {
  const m = current.match(VERSION_RE);
  if (!m) throw new Error(`bad version: ${current}`);
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

async function writeJsonVersion(file, next) {
  const text = await readFile(file, 'utf8');
  const obj = JSON.parse(text);
  obj.version = next;
  await writeFile(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

async function writeCargoToml(file, next) {
  const text = await readFile(file, 'utf8');
  const updated = text.replace(/(^\s*version\s*=\s*")[^"]+(")/m, `$1${next}$2`);
  if (updated === text) {
    throw new Error(`could not find version key in ${file}`);
  }
  await writeFile(file, updated, 'utf8');
}

const STUB = (version) => `# Release v${version} — TODO short headline

TODO one-paragraph elevator pitch (optional for patches).

## Features

- TODO

## Bug fixes

- TODO

## UI/UX

- TODO

## Under the hood

- TODO
`;

async function writeStub(version) {
  const dir = resolve(ROOT, 'docs', 'release-notes', `v${version}`);
  if (existsSync(dir)) {
    console.error(`refusing to overwrite existing folder: ${dir}`);
    exit(1);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'RELEASE_NOTES.md'), STUB(version), 'utf8');
}

async function runChangelog() {
  execFileSync(process.execPath, [GEN_CHANGELOG], { stdio: 'pipe', cwd: ROOT });
}

async function main() {
  const { type, current: explicit } = parseArgs();
  const current = resolveCurrent(explicit);
  const next = nextVersion(current, type);

  await writeStub(next);
  await writeJsonVersion(PACKAGE_JSON, next);
  await writeJsonVersion(TAURI_CONF, next);
  await writeCargoToml(CARGO_TOML, next);
  await runChangelog();

  console.log(
    JSON.stringify(
      {
        current,
        next,
        files: [
          PACKAGE_JSON,
          TAURI_CONF,
          CARGO_TOML,
          resolve(ROOT, 'docs', 'release-notes', `v${next}`, 'RELEASE_NOTES.md'),
          resolve(ROOT, 'CHANGELOG.md'),
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  exit(1);
});
