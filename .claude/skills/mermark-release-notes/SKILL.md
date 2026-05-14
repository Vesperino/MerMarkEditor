---
name: mermark-release-notes
description: Use when the user is about to release the current branch (typically right after `gh pr create`), or asks to "prep a release", "bump version", "write release notes", or invokes the /release-prep slash command. Owns the per-version release-notes workflow described in docs/superpowers/specs/2026-05-14-release-notes-per-version-design.md.
---

# MerMark release-notes workflow

The MerMark repo keeps release notes in `docs/release-notes/vX.Y.Z/RELEASE_NOTES.md`, one folder per published version. `WhatsNewModal` reads the current version from there; `ChangelogModal` walks the whole list. The repo also ships `scripts/bump-version.mjs` and `scripts/gen-changelog.mjs` which together author the next release's stub, sync version numbers across three files, and regenerate the aggregated `CHANGELOG.md`.

## Critical context

- **Tags trigger CI.** Pushing a `vX.Y.Z` git tag triggers GitHub Actions to build and publish the release. **Bump the version files BEFORE the tag is pushed.** That means the bump+notes commit lands on `master` first; the tag is pushed last.
- **Current version = the latest published tag**, not whatever `package.json` says. `package.json` may already be ahead of the last tag if a previous release flow stopped mid-way. Always resolve via:
  1. `gh release list --limit 1 --json tagName --jq '.[0].tagName'`
  2. fallback `git describe --tags --abbrev=0`
- The release-notes commit and the version-bump commit should be the **same commit** so reviewers see them together.

## Section convention

Every `RELEASE_NOTES.md` follows this skeleton (the stub is auto-created by `bump-version.mjs`):

```md
# Release v{X.Y.Z} — {Short headline}

{Optional one-paragraph elevator pitch — recommended for minor/major, skip for patch.}

## Breaking changes        # only when the bump is major

- …

## Features                # new functionality

- …

## Bug fixes               # corrections to existing behaviour

- … (#PR or short cause)

## UI/UX                   # visual polish, small UX wins

- …

## Under the hood          # refactors, deps, tooling

- …
```

Bullet style:

- Imperative, present tense: "Add X", "Fix Y" — never "Added"/"Fixed".
- One line. A second sentence only when the *why* isn't obvious from the line itself.
- Reference `#NN` for the PR or `(closes #NN)` for the issue when applicable.
- **Delete sections that have no bullets before committing.**

## The workflow

When invoked (either via the user saying "let's release this" / "prep a release" / "bump version" / "write release notes", or via the `/release-prep` slash command):

1. **Confirm the PR is already open.** If not, ask the user — the skill should not run against unmerged WIP unless explicitly told to.
2. **Resolve the current version** via `gh release list --limit 1 --json tagName --jq '.[0].tagName'`. Falls back to `git describe --tags --abbrev=0`.
3. **Ask the user to pick the bump type** using `AskUserQuestion` with three options labelled with the actual numbers, e.g. `patch → v0.2.14`, `minor → v0.3.0`, `major → v1.0.0`, computed from the resolved current version.
4. **Run `node scripts/bump-version.mjs <choice>`.** Capture the JSON output — it lists every file the script touched.
5. **Read the freshly-created `docs/release-notes/v{next}/RELEASE_NOTES.md`** and replace the `TODO` placeholders with real bullets drafted from:
   - the PR title and body (`gh pr view` if the agent doesn't already have it in context),
   - the commit log on this branch (`git log --oneline origin/master..HEAD`),
   - the file diff (the agent typically already has this from the conversation).
6. **Delete any section that has no real bullets** (the stub creates all five — empty ones must go).
7. **Re-run `node scripts/gen-changelog.mjs`** so `CHANGELOG.md` reflects whatever was just written into the per-version file.
8. **Stop. Do not commit automatically.** Show the user the summary printed in step 4, the path to the notes file, and a `git status -s` of changed paths. The user reviews then commits manually so the bump and the prose land in one commit they shape.

## What this skill never does

- Pushes anything.
- Creates the git tag.
- Edits old releases' notes.
- Edits `RELEASE_NOTES.md` in the repo root (it does not exist anymore — root notes are migrated under `docs/release-notes/v0.2.12/`).
