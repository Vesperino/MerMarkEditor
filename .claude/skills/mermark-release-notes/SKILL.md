---
name: mermark-release-notes
description: Use when the user is about to release the current branch (typically right after `gh pr create`), or asks to "prep a release", "bump version", "write release notes", or invokes the /release-prep slash command. Owns the per-version release-notes workflow described in docs/superpowers/specs/2026-05-14-release-notes-per-version-design.md.
---

# MerMark release-notes workflow

The MerMark repo keeps release notes in `docs/release-notes/vX.Y.Z/RELEASE_NOTES.md`, one folder per published version. `WhatsNewModal` reads the current version from there; `ChangelogModal` walks the whole list. The repo also ships `scripts/bump-version.mjs` and `scripts/gen-changelog.mjs` which together author the next release's stub, sync version numbers across three files, and regenerate the aggregated `CHANGELOG.md`.

## Critical context

- **Push to `master` triggers CI.** `.github/workflows/release.yml` runs on every push to `master` and creates the GitHub release + tag automatically. Tag creation is a *side effect* of the workflow, not the trigger.
- **Workflow has dual-mode behaviour.** It checks for `docs/release-notes/v${currentPackageVersion}/RELEASE_NOTES.md`:
  - **Prepared mode (`/release-prep` was used):** the file exists → workflow skips its own bump, tags `v${currentPackageVersion}`, and publishes the release with `body_path` pointing at that file.
  - **Legacy fallback:** the file is missing → workflow bumps patch +1, stubs the new notes file, commits, and publishes.
- **Always run `/release-prep` before merging.** The legacy fallback is a safety net, not a happy path — the auto-stub release notes are placeholders and the bump may collide with the version the team intended.
- **Current version = the latest published tag**, not whatever `package.json` says. `package.json` may already be ahead of the last tag if a previous release flow stopped mid-way. Always resolve via:
  1. `gh release list --limit 1 --json tagName --jq '.[0].tagName'`
  2. fallback `git describe --tags --abbrev=0`
- The release-notes commit and the version-bump commit produced by `bump-version.mjs` should be the **same commit** so reviewers see them together.

## Audience and tone

**The reader is the end user**, not a contributor. They open the **What's New** modal after the auto-updater installs the new build and want to know, in their own terms, *what changes for them*. Write for that reader.

- **Lead with the user-visible outcome**, not the implementation. ✅ "Move lines and blocks with Alt+Up/Down." ❌ "Add `MoveBlockExtension` that walks the schema to find a movable sibling."
- **Avoid jargon.** No class names, function names, hook names, package names, internal file paths, ProseMirror/Tiptap terminology, framework names, or PR-related plumbing in the visible text. If you must reference an internal concept, paraphrase it in plain language ("the editor", "the diagram", "the side panel").
- **Talk about features and effects**, not refactors. If a change is purely internal (renaming, splitting files, dependency bumps, type tightening, test additions) **leave it out** — the user has no use for it.
- **PR references stay** because they help maintainers, but keep them at the end of the line in parentheses: "Add a Full changelog browser (#87)". A user can ignore the number; a maintainer can follow it.
- Imperative, present tense: "Add X", "Fix Y" — never "Added"/"Fixed".
- One line. A second sentence only when the *why* isn't obvious — and even then, write it for the user, not the reviewer.
- Plural form when the change covers multiple surfaces ("Add light/dark theme switcher"), singular when it's one specific thing ("Fix crash when reopening the last workspace").

## Section convention

Every `RELEASE_NOTES.md` follows this skeleton (the stub is auto-created by `bump-version.mjs`):

```md
# Release v{X.Y.Z} — {Short headline}

{Optional one-paragraph elevator pitch — recommended for minor/major, skip for patch.}

## Breaking changes        # only when the bump is major; user-visible impact

- …

## Features                # new things the user can do

- …

## Bug fixes               # things that used to be broken and now work

- … (#PR)

## UI/UX                   # visual polish and small UX wins the user will notice

- …
```

- **Do not add an "Under the hood" section.** Internal refactors, build/tooling changes, type tightening, dependency bumps, test additions and similar plumbing do **not** belong in user-facing release notes. If a release contains only this kind of change, write a one-line headline ("Stability and packaging improvements.") and leave the bullet sections out entirely.
- **Delete sections that have no real bullets before committing.** The stub creates Features / Bug fixes / UI/UX — empty ones go.

## The workflow

When invoked (either via the user saying "let's release this" / "prep a release" / "bump version" / "write release notes", or via the `/release-prep` slash command):

1. **Confirm the PR is already open.** If not, ask the user — the skill should not run against unmerged WIP unless explicitly told to.
2. **Resolve the current version** via `gh release list --limit 1 --json tagName --jq '.[0].tagName'`. Falls back to `git describe --tags --abbrev=0`.
3. **Ask the user to pick the bump type** using `AskUserQuestion` with three options labelled with the actual numbers, e.g. `patch → v0.2.14`, `minor → v0.3.0`, `major → v1.0.0`, computed from the resolved current version.
4. **Run `node scripts/bump-version.mjs <choice>`.** Capture the JSON output — it lists every file the script touched.
5. **Read the freshly-created `docs/release-notes/v{next}/RELEASE_NOTES.md`** and replace the `TODO` placeholders with bullets drafted from:
   - the PR title and body (`gh pr view` if the agent doesn't already have it in context),
   - the commit log on this branch (`git log --oneline origin/master..HEAD`),
   - the file diff (the agent typically already has this from the conversation).

   **Translate the technical changes into user-visible outcomes** as you write — see the "Audience and tone" section above. If the only thing the PR did was internal plumbing (refactor, test, type cleanup, dependency bump), do not invent user-facing bullets — write a single-line headline summarising stability/maintenance and skip the bullet sections.
6. **Delete any section that has no real bullets, and drop the "Under the hood" / "Chores" sections entirely** (the stub no longer creates them, but be defensive if you start from an older copy).
7. **Re-run `node scripts/gen-changelog.mjs`** so `CHANGELOG.md` reflects whatever was just written into the per-version file.
8. **Stop. Do not commit automatically.** Show the user the summary printed in step 4, the path to the notes file, and a `git status -s` of changed paths. The user reviews then commits manually so the bump and the prose land in one commit they shape.

## What this skill never does

- Pushes anything.
- Creates the git tag.
- Edits old releases' notes.
- Edits `RELEASE_NOTES.md` in the repo root (it does not exist anymore — root notes are migrated under `docs/release-notes/v0.2.12/`).
