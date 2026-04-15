#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
XT="${ROOT_DIR}/tools/xtool/xtool-x86_64.AppImage"
ENVSH="${ROOT_DIR}/scripts/xtool-env.sh"

cd "$ROOT_DIR/ios-xtool-shell"
"$ENVSH" "$XT" --appimage-extract-and-run dev build --ipa
