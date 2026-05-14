---
name: release-prep
description: Prepare a release on the current branch — bump version, author the per-version release notes from PR context, regenerate CHANGELOG.md. Use after `gh pr create`.
---

Invoke the `mermark-release-notes` skill and follow it end-to-end. The agent already has the PR context (title, body, commits, diff) from the current conversation — use it to fill the release-notes stub rather than asking the user to re-paste anything.

If the user invoked the command with an argument (`/release-prep patch`, `/release-prep minor`, `/release-prep major`), skip the bump-type question and pass that argument directly to `scripts/bump-version.mjs`.

After the bump script runs, the agent **must**:

1. Replace every `TODO` in the new `docs/release-notes/v*/RELEASE_NOTES.md` with real bullets following the section convention defined in the skill.
2. **Write for the end user, not for the team.** Lead with the user-visible outcome ("Move lines and blocks with Alt+Up/Down"), never the implementation ("Add a Tiptap extension that walks the schema"). No class names, file paths, library names, or refactor talk in the body. Translate technical diffs into what changes for someone using the app. If the PR was purely internal plumbing, write a one-line maintenance headline and skip the bullet sections — do not invent fake user-facing items.
3. Delete any section that has no real bullets, and drop any "Under the hood" / "Chores" section if one slipped in.
4. Re-run `node scripts/gen-changelog.mjs` so `CHANGELOG.md` is in sync with whatever was edited.
5. Print a summary (current version, next version, file list, `git status -s`) and stop. Do not commit.
