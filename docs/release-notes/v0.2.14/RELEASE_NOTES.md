# Release v0.2.14 — Per-version release notes + /release-prep

## Features

- **Browse the full changelog inside the app** (#87) — a new **Full changelog →** button on the What's New modal opens a side-by-side history view: every published version on the left, the rendered notes on the right. Translations: `en`, `pl`, `zh-CN`.
- **`/release-prep` slash command + `mermark-release-notes` skill** (#87) — invoke after `gh pr create` to bump the version, author a per-version release-notes file from the PR context, and regenerate `CHANGELOG.md` in one step.

## Under the hood

- **Release notes now live in `docs/release-notes/vX.Y.Z/RELEASE_NOTES.md`** (#87) — one folder per release. The app reads them straight from the bundle via Vite `import.meta.glob('?raw')` instead of fetching the GitHub Releases API at runtime. Root `RELEASE_NOTES.md` migrated to `docs/release-notes/v0.2.12/`; `v0.2.13` backfilled with the actual Alt+Up/Down content (its GitHub release body had been a copy of v0.2.12).
- **`scripts/gen-changelog.mjs`** (#87) — aggregates the folder into a root `CHANGELOG.md` in semver-desc order. Supports `--check` so CI can fail when the file is stale.
- **`scripts/bump-version.mjs`** (#87) — single source of truth for a release bump: writes `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, creates the per-version stub, and runs `gen-changelog`. Resolves the current version from `gh release list` (fallback `git describe --tags`).
- **Shared release-notes stylesheet** (#87) — the rendered-markdown CSS that lived inside `WhatsNewModal.vue` moved to `src/styles/release-notes.css` so both modals share one selector (`.release-notes-content`).
