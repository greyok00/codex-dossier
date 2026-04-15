# Performance Reduction Plan

This plan ranks the biggest known frontend payload and runtime risks for the `0.2` cycle.

## Current build signals

Recent production build highlights:

- `ai-vendor`: about `446 kB` JS gzip-heavy runtime path
- `pdf-vendor`: about `428 kB`
- `react-vendor`: about `268 kB`
- `local-ai`: about `175 kB`
- `export`: about `3.3 kB` lazy entry wrapper for PDF/ZIP export loading
- ONNX wasm assets:
  - `ort-wasm-simd-threaded.wasm`: about `12.5 MB`
  - `ort-wasm-simd-threaded.asyncify.wasm`: about `22.8 MB`

## Highest risks

### 1. Local AI cold start

Risk:

- speech tooling and ONNX assets remain the heaviest part of the app
- low-memory devices may struggle during first transcript runs

Priority:

- highest

Planned response:

- keep local AI lazy-loaded
- ensure transcript UI explains loading/progress clearly
- document practical device limits during QA

### 2. PDF/export path weight

Risk:

- `pdf-lib` contributes a large vendor chunk for a feature that is not needed on first paint

Priority:

- high

Planned response:

- move PDF/export code farther off the initial navigation path if possible
- only load export-heavy code when entering packet/export actions

Status:

- started: export helpers are now lazy-loaded from the send/export actions instead of being imported into the app shell up front

### 3. Browser memory pressure during transcript/export

Risk:

- recording, transcript processing, PDF generation, and ZIP generation all touch large in-memory buffers

Priority:

- high

Planned response:

- prefer one-shot generation only when invoked
- avoid duplicate copies where not required
- document expected limits in QA notes

### 4. General startup weight

Risk:

- despite chunking improvements, the first web session still has a meaningful payload for a utility app

Priority:

- medium

Planned response:

- keep non-critical features behind route or action boundaries
- avoid pulling export/share/AI code into early case browsing surfaces

## Concrete next actions

1. Audit whether `pdf-lib` can be lazy-imported from the export path only.
2. Audit whether ZIP export can be lazy-imported from the export path only.
3. Record first-transcript timing during web QA and future Android QA.
4. Write down any device/browser combinations that show unacceptable cold-start behavior.

## 0.2 rule

`0.2` does not require perfect performance.

It does require:

- no obvious permanent freeze in the main case flow
- understandable progress feedback during heavy actions
- written documentation of the largest known runtime costs
