# Flatpak

Files for publishing MerMark Editor on Flathub as `io.github.Vesperino.MerMarkEditor`.

| File | Purpose |
|------|---------|
| `io.github.Vesperino.MerMarkEditor.yml` | Manifest. Builds the app from source on the GNOME 51 runtime. |
| `cargo-sources.json` | Rust crates for the offline build, generated from `src-tauri/Cargo.lock`. |
| `node-sources.json` | npm packages for the offline build, generated from `pnpm-lock.yaml`. |
| `io.github.Vesperino.MerMarkEditor.metainfo.xml` | AppStream data: description, screenshots, releases. |
| `io.github.Vesperino.MerMarkEditor.desktop` | Launcher, `.md` association and the `mermark://` scheme. |

The Tauri identifier stays `com.mermark.editor`, so settings and data live in the same folders as in the other Linux builds. The Flatpak id is different because Flathub only accepts ids it can verify, and `io.github.Vesperino.*` is verified through the GitHub account.

## How the build works

Flathub requires apps with public source code to be built entirely from source, so the manifest does not use the `.deb` from the releases.

- Runtime `org.gnome.Platform//51` (it ships `webkit2gtk-4.1`), SDK extensions `rust-stable` and `node24` on the matching freedesktop branch `26.08`.
- Sources: the git tag, `cargo-sources.json`, `node-sources.json` and the pnpm 11.3.0 tarball from the npm registry. The Node SDK extension has no pnpm, so the tarball is unpacked next to the sources and run with `node`.
- Steps: `pnpm install --offline --frozen-lockfile`, `pnpm build` (writes `dist/`), then `cargo build --release --offline --features tauri/custom-protocol`. The `custom-protocol` feature makes the binary load the built frontend instead of the dev server URL. The `tauri` CLI is not used.
- The binary is called `mdreader`. The desktop file, metainfo and icons are installed from this folder and from `src-tauri/icons`.
- Playwright browsers (used only by the e2e tests) are not downloaded: `node-sources.json` is generated with `--no-playwright-browsers`.
- The tray feature of Tauri is enabled in `Cargo.toml` but the app creates no tray icon, so `libayatana-appindicator` is not needed.

## Regenerating the sources files

Run this whenever `src-tauri/Cargo.lock` or `pnpm-lock.yaml` changes, and commit the results next to the manifest. Use the checkout of the tag you are about to publish.

```sh
git clone https://github.com/flatpak/flatpak-builder-tools.git
python3 -m venv venv && . venv/bin/activate
pip install ./flatpak-builder-tools/node aiohttp pyyaml tomlkit

python3 flatpak-builder-tools/cargo/flatpak-cargo-generator.py src-tauri/Cargo.lock -o flatpak/cargo-sources.json
flatpak-node-generator pnpm pnpm-lock.yaml -o flatpak/node-sources.json \
  --pnpm-store-version v11 --no-playwright-browsers \
  --node-sdk-extension org.freedesktop.Sdk.Extension.node24//26.08
```

`--pnpm-store-version v11` matches pnpm 11 with a version 9 lockfile. If the `packageManager` field in `package.json` changes, update the `pnpm-11.3.0.tgz` URL and checksum in the manifest as well. When the GNOME runtime moves on, change `runtime-version`, the two SDK extension branches and the `--node-sdk-extension` value together.

## Before every release

1. Tag the release, then put the commit sha of the tag into the `commit:` line of the manifest. Until v0.8.6 exists that line holds a marker, and it is the only value left to fill in.
2. Add a `<release>` entry to the metainfo.
3. Regenerate the two sources files if a lockfile changed.

## Build and test locally

```sh
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user flathub org.flatpak.Builder org.gnome.Platform//51 org.gnome.Sdk//51 \
  org.freedesktop.Sdk.Extension.rust-stable//26.08 org.freedesktop.Sdk.Extension.node24//26.08
cd flatpak
flatpak run org.flatpak.Builder --user --install --force-clean build io.github.Vesperino.MerMarkEditor.yml
flatpak run io.github.Vesperino.MerMarkEditor
flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest io.github.Vesperino.MerMarkEditor.yml
flatpak run --command=flatpak-builder-lint org.flatpak.Builder appstream io.github.Vesperino.MerMarkEditor.metainfo.xml
flatpak run --command=flatpak-builder-lint org.flatpak.Builder builddir build
```

To test the working tree instead of a tag, copy the manifest and replace the `type: git` source block with `type: dir` and `path: /path/to/MerMarkEditor`.

## Submit to Flathub

1. Fork https://github.com/flathub/flathub with "Copy the master branch only" unchecked.
2. `git clone --branch=new-pr git@github.com:<you>/flathub.git && cd flathub`
3. `git checkout -b add-mermark-editor new-pr`
4. Copy the manifest, `cargo-sources.json`, `node-sources.json` into the repository root (not this README, not the metainfo or desktop file, which come from the source tree), then commit and push.
5. Open a pull request against the `new-pr` branch titled `Add io.github.Vesperino.MerMarkEditor`.
6. Answer review comments in the same PR. Comment `bot, build` to start a test build.

Flathub forbids AI-generated manifests and AI-written PR descriptions, commit messages and replies, and requires disclosure of AI-generated material in the app or its packaging. Write the PR text yourself and disclose accordingly.

After the PR is merged, Flathub creates `flathub/io.github.Vesperino.MerMarkEditor` and invites you as a maintainer.

## Updates

- The manifest points at a release tag. For a new release, change `tag` and `commit`, regenerate the sources files if a lockfile changed, and add the `<release>` entry.
- Flathub's external data checker has nothing to watch any more, because there is no `.deb` source. The `x-checker-data` block with `is-main-source` was removed. A `type: git` source can use `x-checker-data` of type `git` with `tag-pattern` if you want automatic version PRs, but the lockfile-derived sources files still have to be regenerated by hand.
- The in-app updater is turned off inside the Flatpak. Settings -> Updates says that updates come from Flathub.

## Permissions

| Permission | Why |
|------------|-----|
| `--socket=wayland`, `--socket=fallback-x11`, `--share=ipc`, `--device=dri` | Window and WebKit GPU rendering |
| `--share=network` | AI assistant: Ollama, OpenAI-compatible servers, remote models |
| `--filesystem=home` | Workspaces anywhere in the home folder, saving next to the opened file and watching it for external changes |

The single-instance D-Bus name is `io.github.Vesperino.MerMarkEditor.SingleInstance`. A Flatpak app can own names under its own id, so `--own-name` is not needed.

Claude Code and Codex CLI are not reachable through `flatpak-spawn --host`. That would need `--talk-name=org.freedesktop.Flatpak`, which lets the app run any command on the host and is rarely accepted on Flathub. Settings -> AI explains this in the Flatpak build. Ollama and OpenAI-compatible servers work over the network.
