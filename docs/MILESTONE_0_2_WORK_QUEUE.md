# 0.2 Mobile Beta Work Queue

This queue translates the `0.2` checklist into execution order.

Current baseline:

- release line: `0.1.2`
- frontend typecheck: passing
- frontend tests: passing
- frontend build: passing
- backend typecheck/build: passing
- Android semver release flow: in place

## A. Already done

These items are complete enough to stop blocking `0.2` work right now.

### Release and packaging discipline

- semver is now the primary public release line
- matching APK is attached to the semver GitHub release
- release process is documented in [docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md)

### Core app flow implemented

- start a case
- transcript generation
- facts review and save
- destination recommendations
- brief drafting
- send/handoff flow
- filing receipt capture
- dossier export

### Documentation baseline

- README reflects the current UI and release line
- [docs/ROADMAP.md](docs/ROADMAP.md) exists
- [docs/MILESTONE_0_2_CHECKLIST.md](docs/MILESTONE_0_2_CHECKLIST.md) exists
- [docs/WEB_QA_LOG_TEMPLATE.md](docs/WEB_QA_LOG_TEMPLATE.md) exists
- [docs/ANDROID_SIGNED_RELEASE_PATH.md](docs/ANDROID_SIGNED_RELEASE_PATH.md) exists

## B. Blocked on real device

These are the highest-priority `0.2` items, but they cannot be honestly closed from desktop-only validation.

### Priority 1

- install the APK on at least 2 real Android devices
- verify first launch and relaunch after force-close
- verify microphone permission flow
- verify location permission flow

### Priority 2

- run the full case flow on-device:
  - record
  - transcript
  - facts
  - destinations
  - brief
  - filing receipt
  - export

### Priority 3

- verify local-first restart behavior on-device
- verify clipboard and external handoff behavior on-device
- verify compact-phone layout on real screens
- verify performance and memory behavior on target phones

### Required artifact from this block

- one short Android QA log committed to `docs/`

## C. Needs implementation

These can be advanced before or alongside real-device QA.

### Priority 1: failure clarity and recovery

- tighten local-mode failure messages where they are still generic
- add clearer fallback messaging for clipboard and external handoff failures
- ensure every major action surface has a recoverable error state

### Priority 2: Android-focused polish

- define a signed Android release path
- document the exact supported/tested Android version range
- add a short release checklist template for each semver release

### Priority 3: performance hardening

- reduce local AI cold-start cost where possible
- document practical device limits for transcript generation
- identify the worst runtime payload contributors and rank them for reduction

### Priority 4: supportability

- create a QA log template for real-device testing
- create a release notes template tied to semver releases

### Progress update

- completed in repo:
  - clearer web share and manual handoff fallback
  - clearer local-mode failure wording across core screens
  - signed Android release path doc
  - web QA log template
- still open:
  - Android QA log template needs real device use
  - release notes template needs to be used on the next release
  - Android version support policy still needs to be written

## D. Suggested execution order

1. Create and commit an Android QA log template
2. Create and commit a release notes template
3. Document the Android version support policy
4. Run real-device QA on 2 phones
5. Fix issues found in that QA
6. Re-cut the next semver release after those fixes

## 0.2 gate

Dossier is ready for `0.2` when:

- section **B** is completed with written evidence
- section **C / Priority 1** is complete
- at least one semver release after `0.1.2` incorporates real-device QA findings
