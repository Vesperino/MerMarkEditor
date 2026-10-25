{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
    in
    {
      packages = forEachSystem (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          nodejs = pkgs.nodejs_22;
          pnpm = pkgs.pnpm_11;
          version = packageJson.version;

          frontend = pkgs.stdenv.mkDerivation {
            pname = "mermark-editor-frontend";
            inherit version;
            src = ./.;

            nativeBuildInputs = [
              nodejs
              pnpm
              pkgs.pnpmConfigHook
              pkgs.pnpmBuildHook
            ];

            pnpmDeps = pkgs.fetchPnpmDeps {
              pname = "mermark-editor-frontend";
              inherit version pnpm;
              src = ./.;
              fetcherVersion = 4;
              hash = "sha256-cMJuDFYHoXcNWKZ/pz1Y3JKjqedGQMA1fZ0QNGJnhh4=";
            };

            installPhase = ''
              mkdir -p "$out"
              cp -r dist "$out/dist"
            '';
          };

          package = pkgs.rustPlatform.buildRustPackage {
            pname = "mermark-editor";
            inherit version;
            src = ./.;
            cargoRoot = "src-tauri";
            cargoLock = {
              lockFile = ./src-tauri/Cargo.lock;
            };
            doCheck = false;

            nativeBuildInputs = with pkgs; [
              cargo-tauri.hook
              jq
              dpkg
              pkg-config
              patchelf
              librsvg
              wrapGAppsHook4
            ];

            buildInputs = with pkgs; [
              dbus
              fontconfig
              freetype
              glib
              glib-networking
              gtk3
              libayatana-appindicator
              libx11
              libxkbcommon
              libsoup_3
              webkitgtk_4_1
              librsvg
            ];

            postPatch = ''
              jq 'del(.build.beforeBuildCommand) | .bundle.createUpdaterArtifacts = false' \
                src-tauri/tauri.conf.json > src-tauri/tauri.conf.json.tmp
              mv src-tauri/tauri.conf.json.tmp src-tauri/tauri.conf.json
            '';

            preBuild = ''
              rm -rf dist
              cp -r ${frontend}/dist dist
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              deb="$(find src-tauri/target -type f -path '*/release/bundle/deb/*.deb' -print -quit)"
              test -n "$deb"
              tmp="$(mktemp -d)"
              dpkg-deb --extract "$deb" "$tmp"
              cp -R "$tmp/usr/." "$out/"
              rm -rf "$tmp"
              runHook postInstall
            '';

            meta = with pkgs.lib; {
              description = packageJson.description;
              homepage = "https://github.com/Vesperino/MerMarkEditor";
              license = licenses.mit;
              mainProgram = "mdreader";
              platforms = platforms.linux;
            };
          };
        in
        {
          default = package;
          mermark-editor = package;
        }
      );

      devShells = forEachSystem (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = import ./shell.nix { inherit pkgs; };
        }
      );

      formatter = forEachSystem (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        pkgs.nixfmt-rfc-style
      );
    };
}
