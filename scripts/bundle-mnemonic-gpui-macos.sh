#!/usr/bin/env bash
set -euo pipefail

profile="debug"
open_bundle="false"

usage() {
  cat <<'USAGE'
Usage: scripts/bundle-mnemonic-gpui-macos.sh [--release] [--open]

Builds mnemonic-app and assembles a local macOS .app bundle at:
  target/macos/Mnemonic GPUI.app

The bundle intentionally reuses the existing v2/Tauri app identity and icon:
  CFBundleIdentifier = dev.mnemonic.desktop
  icon = src-tauri/icons/icon.icns
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      profile="release"
      shift
      ;;
    --open)
      open_bundle="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This bundler currently targets macOS only." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

cargo_args=(build -p mnemonic-app)
if [[ "$profile" == "release" ]]; then
  cargo_args+=(--release)
fi

cargo "${cargo_args[@]}"

binary="$repo_root/target/$profile/mnemonic-app"
icon="$repo_root/src-tauri/icons/icon.icns"
app_dir="$repo_root/target/macos/Mnemonic GPUI.app"
contents_dir="$app_dir/Contents"
macos_dir="$contents_dir/MacOS"
resources_dir="$contents_dir/Resources"

if [[ ! -x "$binary" ]]; then
  echo "Built binary not found or not executable: $binary" >&2
  exit 1
fi
if [[ ! -f "$icon" ]]; then
  echo "Bundled icon missing: $icon" >&2
  exit 1
fi

rm -rf "$app_dir"
mkdir -p "$macos_dir" "$resources_dir"
cp "$binary" "$macos_dir/mnemonic-app"
cp "$icon" "$resources_dir/icon.icns"
chmod +x "$macos_dir/mnemonic-app"

cat > "$contents_dir/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Mnemonic GPUI</string>
  <key>CFBundleExecutable</key>
  <string>mnemonic-app</string>
  <key>CFBundleIconFile</key>
  <string>icon.icns</string>
  <key>CFBundleIdentifier</key>
  <string>dev.mnemonic.desktop</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Mnemonic GPUI</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.developer-tools</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key>
  <true/>
</dict>
</plist>
PLIST

printf 'APPL????' > "$contents_dir/PkgInfo"

if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "$app_dir" >/dev/null 2>&1 || true
fi

echo "Bundled $app_dir"

if [[ "$open_bundle" == "true" ]]; then
  open "$app_dir"
fi
