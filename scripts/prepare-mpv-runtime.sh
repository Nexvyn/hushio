#!/usr/bin/env bash
set -euo pipefail

version="0.42.0"
target_os="${1:?target OS is required}"
architecture="${2:?architecture is required}"
root="${3:-src-tauri/resources/mpv}"
work="${RUNNER_TEMP:-/tmp}/hushio-mpv-${target_os}-${architecture}"

rm -rf "$work" "$root"
mkdir -p "$work" "$root"

download() {
  local url="$1"
  local sha256="$2"
  local output="$3"
  curl --fail --location --retry 3 --silent --show-error "$url" -o "$output"
  local actual
  actual=$( (shasum -a 256 "$output" 2>/dev/null || sha256sum "$output") | awk '{print $1}')
  if [ "$actual" != "$sha256" ]; then
    echo "Checksum mismatch for $output: expected $sha256, got ${actual:-no hash}" >&2
    return 1
  fi
}

copy_licenses() {
  curl --fail --location --silent --show-error \
    "https://raw.githubusercontent.com/mpv-player/mpv/v${version}/LICENSE.GPL" \
    -o "$root/LICENSE.GPL"
  curl --fail --location --silent --show-error \
    "https://raw.githubusercontent.com/mpv-player/mpv/v${version}/LICENSE.LGPL" \
    -o "$root/LICENSE.LGPL"
  curl --fail --location --silent --show-error \
    "https://raw.githubusercontent.com/mpv-player/mpv/v${version}/Copyright" \
    -o "$root/Copyright"
}

case "$target_os:$architecture" in
  windows:x64)
    archive="$work/mpv.zip"
    download \
      "https://github.com/mpv-player/mpv/releases/download/v${version}/mpv-v${version}-x86_64-pc-windows-msvc.zip" \
      "8dd69cbab079086765fa5d873c09513b2834b85d146c1301718a757e8c0595ef" \
      "$archive"
    unzip -q "$archive" -d "$work/unpacked"
    cp "$work/unpacked/mpv.exe" "$root/mpv.exe"
    cp "$work/unpacked/vulkan-1.dll" "$root/vulkan-1.dll"
    ;;
  macos:arm64)
    archive="$work/mpv.zip"
    download \
      "https://github.com/mpv-player/mpv/releases/download/v${version}/mpv-v${version}-macos-15-arm.zip" \
      "be1b8d2445e6880860869c080b8710dee189721f1fa4689840db6a2c10d7be69" \
      "$archive"
    mkdir -p "$work/unpacked"
    unzip -p "$archive" mpv.tar.gz | tar -xzf - -C "$work/unpacked"
    cp "$work/unpacked/mpv.app/Contents/MacOS/mpv" "$root/mpv"
    cp -R "$work/unpacked/mpv.app/Contents/MacOS/lib" "$root/lib"
    ;;
  macos:x64)
    archive="$work/mpv.zip"
    download \
      "https://github.com/mpv-player/mpv/releases/download/v${version}/mpv-v${version}-macos-15-intel.zip" \
      "2d2f34350ff844b6014c35f21ca142937275e19c0c673150a8564fcd2f3bfa14" \
      "$archive"
    mkdir -p "$work/unpacked"
    unzip -p "$archive" mpv.tar.gz | tar -xzf - -C "$work/unpacked"
    cp "$work/unpacked/mpv.app/Contents/MacOS/mpv" "$root/mpv"
    cp -R "$work/unpacked/mpv.app/Contents/MacOS/lib" "$root/lib"
    ;;
  *)
    echo "Unsupported mpv runtime target: $target_os:$architecture" >&2
    exit 2
    ;;
esac

chmod +x "$root/mpv"
copy_licenses
echo "Prepared mpv ${version} runtime in ${root}"
