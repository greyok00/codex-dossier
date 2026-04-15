# Android Signed Release Path

This document defines the intended signed Android release path without requiring real-device QA to happen first.

## Current state

- Dossier already ships a semver GitHub release line
- the attached Android asset is currently a debug APK
- the repo-local Android toolchain can build Android artifacts locally

Current public example:

- `v0.1.2`
- asset: `dossier-v0.1.2-android-debug.apk`

## Goal

Move from debug-only packaging to a repeatable signed Android release flow while keeping the same semver release discipline.

## Intended release shape

- Git tag: `vMAJOR.MINOR.PATCH`
- GitHub release: same semver tag
- Android asset name:
  - signed APK option: `dossier-vMAJOR.MINOR.PATCH-android-release.apk`
  - signed AAB option later if needed: `dossier-vMAJOR.MINOR.PATCH-android-release.aab`

## Required inputs

- Java toolchain
- Android SDK / build tools
- Gradle wrapper already in `frontend/android`
- signing keystore
- keystore alias
- keystore password
- key password

## Recommended secret handling

Do not hardcode signing values in the repo.

Use environment variables or an ignored local properties file for:

- `DOSSIER_ANDROID_KEYSTORE_PATH`
- `DOSSIER_ANDROID_KEYSTORE_PASSWORD`
- `DOSSIER_ANDROID_KEY_ALIAS`
- `DOSSIER_ANDROID_KEY_PASSWORD`

## Planned implementation path

1. Add a release signing config to `frontend/android/app/build.gradle`
2. Read signing values from env vars or ignored local config
3. Add a script such as `npm run release:android:signed`
4. Build the signed artifact
5. Attach the signed artifact to the semver GitHub release instead of the debug APK

## Release rules

- semver stays the only public release line
- signed artifacts replace debug artifacts as the preferred downloadable release
- release notes must state whether the asset is debug or signed

## What is intentionally not implied yet

This document does not claim:

- that signing is already implemented
- that device QA is complete
- that Play Store or App Store distribution is required

It only defines the path so the web-first app and wrapper can converge on one final Android release step later.
