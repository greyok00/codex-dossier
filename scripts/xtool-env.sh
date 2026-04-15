#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export HOME="$ROOT_DIR/tools/swift-home"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_CACHE_HOME="$HOME/.cache"
export SWIFTLY_HOME_DIR="$XDG_DATA_HOME/swiftly"

CONFIG_PATH="$SWIFTLY_HOME_DIR/config.json"
TOOLCHAINS_DIR="/home/grey/.local/share/swiftly/toolchains"

if [ -f "$CONFIG_PATH" ]; then
  IN_USE_VERSION="$(sed -n 's/.*"inUse"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CONFIG_PATH" | head -n 1)"
  if [ -n "${IN_USE_VERSION:-}" ] && [ -d "$TOOLCHAINS_DIR/$IN_USE_VERSION/usr/bin" ]; then
    export PATH="$TOOLCHAINS_DIR/$IN_USE_VERSION/usr/bin:$PATH"
  else
    export PATH="/home/grey/.local/share/swiftly/bin:$PATH"
  fi
else
  export PATH="/home/grey/.local/share/swiftly/bin:$PATH"
fi

exec "$@"
