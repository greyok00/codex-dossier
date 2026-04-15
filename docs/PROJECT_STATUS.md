# Project status

## Summary

Dossier is currently a work in progress.

The repository includes active development code and specs for a local-first incident capture/reporting product. The final intended delivery is a phone app (Android/iOS). Current web runtime is a development and validation surface.

## Current phase

- Product and architecture specs: drafted and locked for MVP iteration
- Backend MVP: implemented with integration tests
- Frontend MVP: implemented local-first capture to report flow
- Mobile packaging/release: Android semver release flow is in place, iOS packaging remains pending

## What is built now

- Voice-first capture flow
- Local evidence hashing and custody log
- Transcript + facts + routing + draft flow in frontend MVP
- Backend services for auth, registry, venue, routing, AI, and submission contracts
- Routing registry seed/import tooling

## What is still in progress

- Final signed Android release flow and iOS native packaging
- Final production credential/billing modes
- Performance tuning for model loading and device compatibility
- Final UX/copy pass

## Platform target

- Final target: Android/iOS app experience
- Current implementation: browser-based/PWA development shell

## Model asset note

Some model assets are too large for standard GitHub single-file limits. During development, repository commits should avoid files larger than hosting limits. For production phone distribution, large model assets are intended to be bundled as mobile app assets.
