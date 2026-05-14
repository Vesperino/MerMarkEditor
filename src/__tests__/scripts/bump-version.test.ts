import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BUMP = resolve(__dirname, '../../../scripts/bump-version.mjs');
const GEN = resolve(__dirname, '../../../scripts/gen-changelog.mjs');

const repos: string[] = [];
afterEach(() => {
  while (repos.length) rmSync(repos.pop()!, { recursive: true, force: true });
});

function fixtureRepo(currentVersion = '0.2.13'): string {
  const dir = mkdtempSync(join(tmpdir(), 'mermark-bump-'));
  repos.push(dir);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'src-tauri'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'release-notes', `v${currentVersion}`), { recursive: true });
  writeFileSync(
    join(dir, 'docs', 'release-notes', `v${currentVersion}`, 'RELEASE_NOTES.md'),
    `# Release v${currentVersion} — Previous\n\nOld.\n`,
  );
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'fake', version: currentVersion }, null, 2),
  );
  writeFileSync(
    join(dir, 'src-tauri', 'tauri.conf.json'),
    JSON.stringify({ productName: 'fake', version: currentVersion }, null, 2),
  );
  writeFileSync(
    join(dir, 'src-tauri', 'Cargo.toml'),
    `[package]\nname = "fake"\nversion = "${currentVersion}"\nedition = "2021"\n`,
  );
  writeFileSync(join(dir, 'scripts', 'gen-changelog.mjs'), readFileSync(GEN, 'utf8'));
  return dir;
}

function run(repo: string, type: string, currentVersion: string) {
  execFileSync(process.execPath, [BUMP, type, '--current', currentVersion], {
    cwd: repo,
    stdio: 'pipe',
  });
}

describe('bump-version.mjs', () => {
  it('bumps patch and creates the release-notes stub', () => {
    const repo = fixtureRepo('0.2.13');
    run(repo, 'patch', '0.2.13');

    expect(JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version).toBe('0.2.14');
    expect(
      JSON.parse(readFileSync(join(repo, 'src-tauri/tauri.conf.json'), 'utf8')).version,
    ).toBe('0.2.14');
    expect(readFileSync(join(repo, 'src-tauri/Cargo.toml'), 'utf8')).toContain(
      'version = "0.2.14"',
    );
    expect(existsSync(join(repo, 'docs/release-notes/v0.2.14/RELEASE_NOTES.md'))).toBe(true);
    expect(readFileSync(join(repo, 'CHANGELOG.md'), 'utf8')).toMatch(/v0\.2\.14/);
  });

  it('bumps minor and major', () => {
    const repoMinor = fixtureRepo('0.2.13');
    run(repoMinor, 'minor', '0.2.13');
    expect(JSON.parse(readFileSync(join(repoMinor, 'package.json'), 'utf8')).version).toBe(
      '0.3.0',
    );

    const repoMajor = fixtureRepo('0.2.13');
    run(repoMajor, 'major', '0.2.13');
    expect(JSON.parse(readFileSync(join(repoMajor, 'package.json'), 'utf8')).version).toBe(
      '1.0.0',
    );
  });

  it('refuses to overwrite an existing folder', () => {
    const repo = fixtureRepo('0.2.13');
    mkdirSync(join(repo, 'docs/release-notes/v0.2.14'));
    expect(() => run(repo, 'patch', '0.2.13')).toThrow();
  });
});
