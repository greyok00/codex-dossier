# Android QA Log Template

Use this template for real-device Android testing once devices are in the loop.

## Session

- Date:
- Build / release:
- Device:
- Android version:
- Install type:
  - debug APK
  - signed APK
- Tester:

## Launch and permissions

- [ ] App installs successfully
- [ ] First launch succeeds
- [ ] Relaunch after force-close succeeds
- [ ] Microphone permission is understandable
- [ ] Location permission is understandable

## Core case flow

- [ ] Start a case
- [ ] Save recording
- [ ] Create transcript
- [ ] Save facts
- [ ] Generate destinations
- [ ] Approve brief
- [ ] Use send/handoff flow
- [ ] Save filing receipt
- [ ] Export packet

## Mobile behavior

- [ ] Buttons remain inside bounds
- [ ] Text is readable on device
- [ ] Scroll regions behave correctly
- [ ] Clipboard and share behavior are understandable
- [ ] External handoff is understandable

## Reliability

- [ ] Saved case survives app restart
- [ ] Selected destination survives restart
- [ ] Approved brief survives restart
- [ ] Filing receipt survives restart

## Performance

- [ ] App open is acceptable
- [ ] Transcript generation is acceptable
- [ ] Navigation is responsive
- [ ] No repeated crash loop observed

## Issues found

1.
2.
3.

## Result

- Pass / needs fixes:
- Summary:
