# Release process

Dossier now uses semver as the primary release line.

## Rules

- Every public release is tagged as `vMAJOR.MINOR.PATCH`
- Android APKs are attached to the matching semver release
- One-off names like `*-android-debug` are allowed only as asset filenames, not as release tags
- `package.json` and `frontend/package.json` must carry the same version before a release is cut

## Current line

- Active release tag format: `v0.1.2`, `v0.1.3`, `v0.2.0`
- Current Android asset format: `dossier-v0.1.2-android-debug.apk`

## Release command

From the repo root:

```bash
npm run release:android
```

What it does:

- checks that root and frontend versions match
- requires a semver version
- builds the debug APK if it is missing
- creates the semver git tag if needed
- creates or reuses the matching GitHub release
- uploads the Android APK to that release
- pushes `main` and the semver tag

## Before a release

1. Bump both package versions to the next semver.
2. Verify the frontend and backend checks you care about.
3. Run `npm run release:android`.
4. Fill out [docs/RELEASE_NOTES_TEMPLATE.md](docs/RELEASE_NOTES_TEMPLATE.md) for the shipped state.

## Notes

- The current Android release flow attaches the debug APK because that is the stable local artifact already proven in this repo.
- When signed release APKs are ready, the asset name can change, but the release tag should stay semver.
- The intended signed Android path is documented in [docs/ANDROID_SIGNED_RELEASE_PATH.md](docs/ANDROID_SIGNED_RELEASE_PATH.md).
