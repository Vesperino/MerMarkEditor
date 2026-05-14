import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../../../scripts/gen-changelog.mjs');

const repos: string[] = [];
afterEach(() => {
  while (repos.length) rmSync(repos.pop()!, { recursive: true, force: true });
});

function fixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mermark-changelog-'));
  repos.push(dir);
  mkdirSync(join(dir, 'docs', 'release-notes', 'v0.1.0'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'release-notes', 'v0.2.0'), { recursive: true });
  writeFileSync(
    join(dir, 'docs', 'release-notes', 'v0.1.0', 'RELEASE_NOTES.md'),
    '# Release v0.1.0 — Initial\n\nFirst.\n',
  );
  writeFileSync(
    join(dir, 'docs', 'release-notes', 'v0.2.0', 'RELEASE_NOTES.md'),
    '# Release v0.2.0 — Second\n\nSecond.\n',
  );
  return dir;
}

describe('gen-changelog.mjs', () => {
  it('writes CHANGELOG.md with versions in semver-desc order', () => {
    const repo = fixtureRepo();
    execFileSync(process.execPath, [SCRIPT], { cwd: repo, stdio: 'pipe' });
    const out = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');
    expect(out).toMatch(/Release v0\.2\.0/);
    expect(out.indexOf('Release v0.2.0')).toBeLessThan(out.indexOf('Release v0.1.0'));
  });

  it('exits 0 with --check when CHANGELOG.md is already up-to-date', () => {
    const repo = fixtureRepo();
    execFileSync(process.execPath, [SCRIPT], { cwd: repo, stdio: 'pipe' });
    execFileSync(process.execPath, [SCRIPT, '--check'], { cwd: repo, stdio: 'pipe' });
  });

  it('exits 1 with --check when CHANGELOG.md is missing', () => {
    const repo = fixtureRepo();
    expect(() =>
      execFileSync(process.execPath, [SCRIPT, '--check'], { cwd: repo, stdio: 'pipe' }),
    ).toThrow();
  });
});
