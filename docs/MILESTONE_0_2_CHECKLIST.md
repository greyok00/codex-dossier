# 0.2 Mobile Beta Checklist

This checklist defines the minimum bar for calling Dossier `0.2`.

## 1. Android device validation

- [ ] Install `v0.1.x` APK on at least 2 real Android devices
- [ ] Confirm first launch completes without crashes
- [ ] Confirm app relaunch works after force-close
- [ ] Confirm microphone permission prompt is understandable and recoverable
- [ ] Confirm location permission prompt is understandable and recoverable

## 2. Core case flow on-device

- [ ] Start a case and save a recording
- [ ] Verify recording hash and custody entry are written
- [ ] Create transcript on-device
- [ ] Review and save facts
- [ ] Generate destination recommendations
- [ ] Open `Write report` from a destination
- [ ] Copy/send/handoff the brief
- [ ] Save a filing receipt
- [ ] Export the dossier

## 3. Local-first reliability

- [ ] Existing saved cases still open after app restart
- [ ] Draft, selected destination, and filing receipt survive restart
- [ ] App remains usable with backend unavailable
- [ ] Failure states explain local mode clearly

## 4. Mobile interaction quality

- [ ] Buttons remain inside control bounds on-device
- [ ] No critical text is clipped at compact phone widths
- [ ] Scroll regions behave correctly in `Destinations`, `Write report`, and `Dossier`
- [ ] Clipboard behavior is reliable or has a clear fallback
- [ ] External handoff to browser, phone, or email is understandable

## 5. Performance bar

- [ ] Initial app open feels acceptable on target phones
- [ ] Transcript generation does not freeze the app permanently
- [ ] Navigation between major screens is responsive
- [ ] Memory pressure does not cause obvious repeated crashes
- [ ] APK size and runtime payload are documented as known constraints

## 6. Release and packaging

- [ ] Semver release flow remains the only public release line
- [ ] Matching APK is attached to the semver GitHub release
- [ ] Release notes reflect the actual shipped state
- [ ] Known limitations are written down before release

## 7. Documentation and supportability

- [ ] README reflects the current UI and release line
- [ ] [docs/ROADMAP.md](docs/ROADMAP.md) matches the actual milestone state
- [ ] [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md) remains accurate
- [ ] At least one short QA log exists for the tested Android devices

## 0.2 decision rule

Dossier is ready for `0.2` when:

- every section above is either checked off or explicitly deferred with a written reason
- no known blocker remains in the core case flow
- Android testing shows the app is credible for real user evaluation, not just local development
