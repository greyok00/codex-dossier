# Frontend UI Rebuild Feature List

Status: active rebuild contract
Date: 2026-04-13

This document defines the current frontend feature surface that the replacement UI must preserve while replacing the old interface implementation.

## Product Scope

- Local-first incident capture and reporting workflow
- Mobile-first PWA shell
- Guided, sequential case-building flow from capture to export
- Dark, glass-first visual direction for v2

## Runtime Foundations To Keep

- React 19 + TypeScript + Vite frontend runtime
- React Router navigation
- TanStack Query for async query/mutation state
- Dexie/IndexedDB local persistence
- Local browser AI path for speech transcription, fact extraction, routing, and draft generation
- Existing backend/runtime bridge contracts in `frontend/src/lib/runtime.ts`
- Existing local database contracts in `frontend/src/lib/db.ts`
- Existing export builders in `frontend/src/lib/export.ts`

## Required App Shell Features

- BrowserRouter-based app shell
- Bottom navigation with primary sections:
  - Capture
  - Cases
  - Routes
  - Settings
- Persist last open path
- Loading states for async screens
- Empty/error states for missing case data

## Required Startup And Access Features

- Device bootstrap/load screen
- Immediate local AI preparation on first launch
- First-run local model download/progress UI
- Local unlock gate when device code is configured
- Device code setup screen
- Optional platform biometric/device unlock enablement
- Require-unlock-on-open setting
- Manual lock action

## Required Capture Flow Features

- Capture screen with one primary record toggle
- Live capture timer
- Capture status display
- Device location status display
- Microphone capture through `getUserMedia`
- MediaRecorder capture pipeline
- Auto-save captured audio into a new case
- Evidence hashing on save
- Custody log entry for saved evidence
- Quick guide / walkthrough cue on capture flow

## Required Case-Building Flow Features

- Capture saved screen
- Transcript creation from saved capture
- Transcript progress UI
- Transcript full text display
- Transcript segment display with timestamps and speaker labels
- Fact extraction from transcript
- Fact review/edit UI
- Fact confirmation/save action
- Display of edited fields / saved review state

## Required Routing Features

- Global routes index screen
- Case-specific route recommendation screen
- Route recommendation generation action
- Route grouping display
- Source-backed route metadata display:
  - reason
  - source label
  - trust level
  - last verified date
  - intake methods
  - required documents
  - available actions
- Route selection persistence
- Route selection reflected in case file

## Required Draft And Send Features

- Draft generation for selected route
- Draft subject/body editor
- Attachment label display
- Draft approval/save action
- Send or handoff screen
- External open actions for complaint URLs, email links, phone links
- Native share flow when supported
- Download fallback when share is unavailable
- Send/share action logging

## Required Proof And Export Features

- Proof of action form
- Save proof with:
  - method
  - status
  - confirmation number
  - external reference URL
  - notes
- Case export screen
- Export PDF packet
- Export ZIP packet
- Create export evidence records
- Trigger local file download

## Required Case Management Features

- Cases list
- Open case file
- Delete case action
- Case file overview with:
  - incident metadata
  - fact summary
  - selected route summary
  - draft summary
  - proof summary
  - evidence summary
  - custody log summary
- Expand/collapse full custody log

## Required Settings Features

- Theme selection surface
- Quick-guide / walkthrough controls
- Capture reminder reset
- Roadmap / FAQ content
- Access controls summary
- Link to device code setup/change

## Required Demo / Walkthrough Features

- Demo walkthrough case creation after setup
- Walkthrough hints on key screens
- Demo case identification in lists/case file
- Demo flow instructions inside the case file

## Required Non-Visual Behaviors

- Preserve existing local database schema and data contracts
- Preserve current route paths where feasible
- Preserve current tests or replace them with equivalent coverage
- Preserve PWA boot and localhost service-worker cleanup behavior
- Prefer `whisper-tiny` for local speech tools

## Planned UI Replacement Boundary

The following should be replaced wholesale rather than incrementally restyled:

- `frontend/src/App.tsx`
- `frontend/src/styles.css`
- Old button/card/form layout primitives embedded inside `App.tsx`

The following should remain as the application logic layer unless a specific cleanup becomes necessary:

- `frontend/src/lib/db.ts`
- `frontend/src/lib/runtime.ts`
- `frontend/src/lib/local-ai.ts`
- `frontend/src/lib/local-routing.ts`
- `frontend/src/lib/export.ts`
