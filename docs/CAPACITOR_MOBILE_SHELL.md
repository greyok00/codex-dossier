# Capacitor Mobile Shell

Dossier now includes a Capacitor wrapper path so the current React/Vite app can be packaged inside native Android and iOS project shells without rewriting the screen flow.

## What Exists Now

- Capacitor config in `frontend/capacitor.config.ts`
- Native-oriented frontend scripts in `frontend/package.json`
- A native-aware service bridge in `frontend/src/lib/runtime.ts`
- Target native project shells for:
  - `frontend/android/`
  - `frontend/ios/`

## Why This Fits Dossier

The app already routes platform behavior through `AppServices`, so the wrapper can sit under the current UI instead of forcing a product rewrite.

Current native-aware bridge behavior:

- `share()` uses Capacitor Share on native shells
- `openExternal()` uses Capacitor Browser for `http` and `https` links on native shells
- `downloadFile()` writes a temporary native file and opens the native share sheet
- `getCurrentPosition()` uses Capacitor Geolocation on native shells

## What These Folders Are

The generated Android and iOS folders are project shells for native apps.

They are not proof that final distributable binaries were built on this machine.

## Current Constraint On This Machine

This environment can generate and commit the native project shells, but it is not yet a complete mobile build workstation.

Current gaps:

- Android build tooling is incomplete here
  - `java` exists
  - `adb` exists
  - `gradle` is not installed
  - `sdkmanager` is not installed
- iOS packaging still requires Apple platform tooling that is not present here
  - no `xcodebuild`
  - this machine is Linux

## Practical Next Step

To make real mobile binaries from this wrapper:

1. Install Android SDK/Gradle tooling on this machine and produce an Android debug or release build locally.
2. Use a macOS machine, VM, or remote CI runner with Xcode to build the iOS app shell.
3. Publish binaries outside the App Store if desired, for example direct-hosted artifacts, internal distribution, or Android alternatives such as F-Droid workflows.
