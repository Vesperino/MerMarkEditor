{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  packages = [
    pkgs.nodejs_22
    pkgs.pnpm_11
    pkgs.rustc
    pkgs.cargo
    pkgs.cargo-tauri
    pkgs.pkg-config
    pkgs.jq
    pkgs.nixfmt-rfc-style
  ];

  buildInputs = [
    pkgs.dbus
    pkgs.fontconfig
    pkgs.freetype
    pkgs.glib
    pkgs.glib-networking
    pkgs.gtk3
    pkgs.libayatana-appindicator
    pkgs.libx11
    pkgs.libxkbcommon
    pkgs.libsoup_3
    pkgs.webkitgtk_4_1
    pkgs.librsvg
  ];
}
