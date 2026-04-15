# Roadmap

This is the current working path from the active `0.1.x` line to `1.0`.

## 0.1.x Stabilization

Goal: make the existing local-first case flow reliable enough for repeatable internal and early-beta use.

Exit criteria:

- Android debug APK installs and runs on real devices
- capture, transcript, facts, destinations, brief, proof, and export flow all complete on-device
- obvious crashers, data-loss paths, and broken navigation are removed
- semver release process stays consistent
- README, release docs, and packaging flow stay current

## 0.2 Mobile Beta

Goal: move from engineering-stable to user-testable on Android.

Exit criteria:

- permission flow is clean on Android
- offline/local-first behavior is validated across close, reopen, and restart
- performance is acceptable on target phones
- clipboard, handoff, share, and export behavior work cleanly on-device
- signed Android release path is defined, even if still limited

Working checklist:

- [docs/MILESTONE_0_2_CHECKLIST.md](docs/MILESTONE_0_2_CHECKLIST.md)
- [docs/MILESTONE_0_2_WORK_QUEUE.md](docs/MILESTONE_0_2_WORK_QUEUE.md)

## 0.5 Production Beta

Goal: make the product credible for serious field testing.

Exit criteria:

- route quality and report quality are improved with stronger heuristics and clearer trust labels
- evidence packaging is more defensible and consistent
- UX and copy are tightened across the full app
- failure states are explicit and recoverable
- telemetry or local diagnostics exist for debugging field issues

## 0.9 Release Candidate

Goal: remove the last blockers to a real 1.0 launch.

Exit criteria:

- Android release packaging is stable and repeatable
- device QA covers the intended target matrix
- performance and storage behavior are acceptable under real-case usage
- security/privacy review is complete for the local-first model
- iOS path is either shipping, intentionally deferred, or clearly separated from 1.0

## 1.0

Goal: ship Dossier as a stable product, not just a capable prototype.

Required characteristics:

- core case workflow is dependable on supported phones
- Android release distribution is repeatable and documented
- user-facing language and screens feel finished
- known limitations are narrow and explicit
- release process, versioning, and documentation are disciplined

## Current position

Current release line: `0.1.5`

Practical assessment:

- core workflow exists
- release discipline is now in place
- packaging exists on Android
- biggest remaining work is device validation, performance hardening, and final product polish

That places Dossier roughly in late `0.1.x`, on the path toward `0.2` rather than near `1.0`.
