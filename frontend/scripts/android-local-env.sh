#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${JAVA_HOME:-}" ] && [ -d "$ROOT_DIR/.jdks" ]; then
  LOCAL_JDK="$(find "$ROOT_DIR/.jdks" -maxdepth 1 -mindepth 1 -type d -name 'jdk-21*' | sort | tail -n 1)"
  if [ -n "$LOCAL_JDK" ]; then
    export JAVA_HOME="$LOCAL_JDK"
  fi
fi

if [ -n "${JAVA_HOME:-}" ]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ -z "${ANDROID_SDK_ROOT:-}" ] && [ -d "$ROOT_DIR/.android-sdk" ]; then
  export ANDROID_SDK_ROOT="$ROOT_DIR/.android-sdk"
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -n "${ANDROID_SDK_ROOT:-}" ]; then
  export ANDROID_HOME="$ANDROID_SDK_ROOT"
fi

export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$ROOT_DIR/.gradle}"

exec "$@"
