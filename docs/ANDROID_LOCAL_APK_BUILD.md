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

## What You Need On This Machine

Required:

- Java 21
- Android SDK command-line tools
- Android platform tools
- Android build tools
- An Android platform SDK

This machine already has:

- `java`
- `adb`

This machine is still missing:

- `sdkmanager`
- a configured Android SDK install

## Command-Line Build Path

Once the Android SDK command-line tools are installed and `ANDROID_HOME` or `ANDROID_SDK_ROOT` is set, build commands are:

```bash
cd frontend
npm install
npm run android:build:debug
```

Debug APK output:

```bash
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

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
- The Android shell is real and ready, but this machine still needs Android SDK command-line tools before it can produce an APK
