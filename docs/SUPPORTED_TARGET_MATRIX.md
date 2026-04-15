# Supported Target Matrix

This matrix defines the intended support policy for Dossier during the `0.2` cycle.

## Current support stance

Dossier is currently:

- web-first for active development and validation
- Android-wrapper-ready, but not yet device-certified
- local-first by default

## Browser targets for `0.2`

Primary browsers:

- Chrome desktop, current stable
- Chromium desktop, current stable
- Edge desktop, current stable

Secondary browsers:

- Chrome on Android, current stable
- Samsung Internet, current stable major line

Best-effort only:

- Safari desktop
- Safari on iOS/iPadOS
- Firefox desktop

## Browser expectations

Required for a credible `0.2` web build:

- IndexedDB works
- MediaRecorder works for audio capture
- getUserMedia works for microphone access
- file download works
- clipboard copy has either direct support or a usable fallback
- external handoff works or is recoverable through manual fallback

## Android targets for `0.2`

Intended baseline:

- Android 13
- Android 14
- Android 15

Best-effort:

- Android 12, if the local AI/runtime footprint is still acceptable

Not yet promised:

- Android 11 and below

## Form factor targets

Primary target:

- compact phone width around `390px` logical width

Secondary target:

- common Android portrait phone widths around `360px` to `430px`

Not a `0.2` priority:

- tablet-first layouts
- desktop-wide optimized layouts

## Runtime mode targets

Primary:

- `local` mode

Secondary:

- `backend` mode with detached frontend health handling

## Notes

- This matrix is a development support policy, not a legal guarantee.
- Actual supported Android/device rows should tighten after real-device QA logs exist.
