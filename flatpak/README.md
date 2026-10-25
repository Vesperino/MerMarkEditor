# Flatpak

Files for publishing MerMark Editor on Flathub as `io.github.Vesperino.MerMarkEditor`.

| File | Purpose |
|------|---------|
| `io.github.Vesperino.MerMarkEditor.yml` | Manifest. Repackages the `.deb` from the GitHub release on the GNOME 51 runtime. |
| `io.github.Vesperino.MerMarkEditor.metainfo.xml` | AppStream data: description, screenshots, releases. |
| `io.github.Vesperino.MerMarkEditor.desktop` | Launcher, `.md` association and the `mermark://` scheme. |

The Tauri identifier stays `com.mermark.editor`, so settings and data live in the same folders as in the other Linux builds. The Flatpak id is different because Flathub only accepts ids it can verify, and `io.github.Vesperino.*` is verified through the GitHub account.

## Before submitting

Flathub's requirements say that apps with public source code "must be built entirely from source code". A manifest that repackages a prebuilt `.deb` can be rejected in review. If reviewers ask for a source build, the manifest needs:

- `org.freedesktop.Sdk.Extension.rust-stable` and `org.freedesktop.Sdk.Extension.node22`
- `cargo-sources.json` from `flatpak-cargo-generator.py src-tauri/Cargo.lock` (the lockfile is gitignored today and would have to be committed)
- `node-sources.json` from `flatpak-node-generator pnpm pnpm-lock.yaml`
- `pnpm install --offline --frozen-lockfile && pnpm build`, then `cargo build --release --offline --features tauri/custom-protocol` in `src-tauri`

Submit with a release that includes Flatpak detection (v0.9.0 or later). Older binaries still run, but their update check stays on and a second launch opens a second window instead of a new tab.

## Build and test locally

```sh
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user flathub org.flatpak.Builder
cd flatpak
flatpak run org.flatpak.Builder --user --install --install-deps-from=flathub --force-clean build io.github.Vesperino.MerMarkEditor.yml
flatpak run io.github.Vesperino.MerMarkEditor
flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest io.github.Vesperino.MerMarkEditor.yml
flatpak run --command=flatpak-builder-lint org.flatpak.Builder appstream io.github.Vesperino.MerMarkEditor.metainfo.xml
```

## Submit to Flathub

1. Fork https://github.com/flathub/flathub with "Copy the master branch only" unchecked.
2. `git clone --branch=new-pr git@github.com:<you>/flathub.git && cd flathub`
3. `git checkout -b add-mermark-editor new-pr`
4. Copy the three files above into the repository root (not this README), then commit and push.
5. Open a pull request against the `new-pr` branch titled `Add io.github.Vesperino.MerMarkEditor`.
6. Answer review comments in the same PR. Comment `bot, build` to start a test build.

Flathub closes PRs with a lot of AI-generated text without review, so write the PR description and replies yourself.

After the PR is merged, Flathub creates `flathub/io.github.Vesperino.MerMarkEditor` and invites you as a maintainer.

## Updates

- Every GitHub release publishes `MerMark.Editor_<version>_amd64.deb`. Keep that file name, the checker looks for it.
- Flathub's external data checker regularly reads the latest release and opens a PR in the app repository that updates the `.deb` URL and checksum and adds a `<release>` entry to the metainfo.
- Review and merge that PR. Flathub builds and publishes the update, and users get it from their software center.
- The in-app updater is turned off inside the Flatpak. Settings → Updates says that updates come from Flathub.

## Permissions

| Permission | Why |
|------------|-----|
| `--socket=wayland`, `--socket=fallback-x11`, `--share=ipc`, `--device=dri` | Window and WebKit GPU rendering |
| `--share=network` | AI assistant: Ollama, OpenAI-compatible servers, remote models |
| `--filesystem=home` | Workspaces anywhere in the home folder, saving next to the opened file and watching it for external changes |

The single-instance D-Bus name is `io.github.Vesperino.MerMarkEditor.SingleInstance`. A Flatpak app can own names under its own id, so `--own-name` is not needed.

Claude Code and Codex CLI are not reachable through `flatpak-spawn --host`. That would need `--talk-name=org.freedesktop.Flatpak`, which lets the app run any command on the host and is rarely accepted on Flathub. Settings → AI explains this in the Flatpak build. Ollama and OpenAI-compatible servers work over the network.
