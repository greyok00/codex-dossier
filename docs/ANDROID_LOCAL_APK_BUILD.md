# Android Local APK Build

Dossier can be packaged as a self-contained Android app without hosting the backend.

That works because the frontend already defaults to local mode:

- `VITE_DOSSIER_API_MODE=local`
- local AI and case data run inside the app bundle and device storage

## What This Means

- No hosted backend is required for the Android build target
- The app ships with bundled web assets inside the native shell
- The Android wrapper is already in `frontend/android`
- The generated project includes a Gradle wrapper, so Android Studio is not required
- This repo now supports a repo-local Android toolchain under `frontend/.android-sdk`, `frontend/.jdks`, and `frontend/.gradle`

## What You Need On This Machine

Required:

- Java 21
- Android SDK command-line tools
- Android platform tools
- Android build tools
- An Android platform SDK

This repo can provide those locally:

- local JDK 21 in `frontend/.jdks/jdk-21.0.10+7`
- local Android SDK in `frontend/.android-sdk`
- local Gradle cache in `frontend/.gradle`

## Command-Line Build Path

With the local toolchain in place, build commands are:

```bash
cd frontend
npm install
npm run android:build:debug
```

The build scripts automatically prefer the repo-local JDK, Android SDK, and Gradle cache if they exist.

Debug APK output:

```bash
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Versioned GitHub release path:

```bash
cd ..
npm run release:android
```

That flow publishes a semver release such as `v0.1.2` and attaches the APK as a release asset instead of using a one-off release name.

Install to a connected device:

```bash
cd frontend
npm run android:install:debug
```

Release APK path:

```bash
cd frontend
npm run android:build:release
```

Release APK output:

```bash
frontend/android/app/build/outputs/apk/release/app-release.apk
```

## Why This Avoids A Hosted Backend

The app is configured to use local mode unless you explicitly switch it to backend mode.

That means:

- capture stays local
- transcript/facts/routes/draft flow stays local
- export stays local

## Current Constraints

- Mobile WebView performance for local AI may still be heavier than desktop Chromium
- The debug APK is large because the current web bundle includes ONNX and model runtime assets
- The current published Android asset is a debug APK; signed release packaging is separate work
- iOS native packaging is still separate work; for iOS we will evaluate `xtool` independently from this Android path
