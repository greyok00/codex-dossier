#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
XT="${ROOT_DIR}/tools/xtool/xtool-x86_64.AppImage"
ENVSH="${ROOT_DIR}/scripts/xtool-env.sh"

"$ENVSH" swift --version
"$ENVSH" swift sdk list || true
"$ENVSH" "$XT" --appimage-extract-and-run auth status
