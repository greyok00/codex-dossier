#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ROOT_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
FRONTEND_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('frontend/package.json', 'utf8')).version")"
VERSION="${1:-$ROOT_VERSION}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "Release version must be semver, for example: 0.1.2 or 0.2.0-rc.1" >&2
  exit 1
fi

if [[ "$ROOT_VERSION" != "$FRONTEND_VERSION" ]]; then
  echo "Root and frontend package versions must match before releasing." >&2
  echo "root:     $ROOT_VERSION" >&2
  echo "frontend: $FRONTEND_VERSION" >&2
  exit 1
fi

if [[ "$VERSION" != "$ROOT_VERSION" ]]; then
  echo "Requested version $VERSION does not match package.json version $ROOT_VERSION." >&2
  echo "Bump both package versions first, then rerun the release." >&2
  exit 1
fi

TAG="v$VERSION"
APK_PATH="frontend/android/app/build/outputs/apk/debug/app-debug.apk"
ASSET_NAME="dossier-${TAG}-android-debug.apk"
RELEASE_BODY="Dossier ${TAG}. Semver release with attached Android APK."

if [[ ! -f "$APK_PATH" ]]; then
  echo "APK not found at $APK_PATH. Building it now..." >&2
  npm --prefix frontend run android:build:debug
fi

git diff --quiet
git diff --cached --quiet

if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  git tag -a "$TAG" -m "$TAG"
fi

git push origin main
git push origin "$TAG"

fill_credential() {
  printf "protocol=https\nhost=github.com\n\n" | git credential fill
}

credential="$(fill_credential)"
username="$(printf "%s\n" "$credential" | sed -n 's/^username=//p')"
password="$(printf "%s\n" "$credential" | sed -n 's/^password=//p')"

if [[ -z "$username" || -z "$password" ]]; then
  echo "GitHub credentials are not available through git credential store." >&2
  exit 1
fi

release_json="$(curl -fsS -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" -u "$username:$password" \
  "https://api.github.com/repos/greyok00/codex-dossier/releases/tags/$TAG" || true)"

if [[ -z "$release_json" ]]; then
  release_json="$(curl -fsS -X POST -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
    -u "$username:$password" \
    "https://api.github.com/repos/greyok00/codex-dossier/releases" \
    -d "{\"tag_name\":\"$TAG\",\"target_commitish\":\"main\",\"name\":\"$TAG\",\"body\":\"$RELEASE_BODY\",\"draft\":false,\"prerelease\":false}")"
fi

release_id="$(printf "%s" "$release_json" | node -e "let data='';process.stdin.on('data',d=>data+=d);process.stdin.on('end',()=>{const json=JSON.parse(data);process.stdout.write(String(json.id ?? ''));});")"
upload_url="$(printf "%s" "$release_json" | node -e "let data='';process.stdin.on('data',d=>data+=d);process.stdin.on('end',()=>{const json=JSON.parse(data);process.stdout.write(String((json.upload_url ?? '').replace('{?name,label}','')));});")"
html_url="$(printf "%s" "$release_json" | node -e "let data='';process.stdin.on('data',d=>data+=d);process.stdin.on('end',()=>{const json=JSON.parse(data);process.stdout.write(String(json.html_url ?? ''));});")"

if [[ -z "$release_id" || -z "$upload_url" ]]; then
  echo "Could not resolve GitHub release metadata for $TAG." >&2
  exit 1
fi

assets_json="$(curl -fsS -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" -u "$username:$password" \
  "https://api.github.com/repos/greyok00/codex-dossier/releases/$release_id/assets")"
asset_id="$(printf "%s" "$assets_json" | node -e "let data='';process.stdin.on('data',d=>data+=d);process.stdin.on('end',()=>{const assets=JSON.parse(data);const match=assets.find(asset=>asset.name==='${ASSET_NAME}');process.stdout.write(String(match?.id ?? ''));});")"

if [[ -n "$asset_id" ]]; then
  curl -fsS -X DELETE -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" -u "$username:$password" \
    "https://api.github.com/repos/greyok00/codex-dossier/releases/assets/$asset_id" >/dev/null
fi

curl -fsS -X POST -H "Accept: application/vnd.github+json" -H "Content-Type: application/vnd.android.package-archive" \
  -u "$username:$password" \
  --data-binary @"$APK_PATH" \
  "${upload_url}?name=${ASSET_NAME}" >/dev/null

echo "Release published: $html_url"
echo "APK asset: $ASSET_NAME"
