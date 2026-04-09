# Dossier Technical Spec

Status: Approved pre-build spec
Last updated: 2026-04-07
Project folder: `/home/grey/codex-dossier`

## 1. Product Summary

Dossier is a mobile-only, installable web app for capturing an incident once and turning it into a usable reporting packet with proof.

Product line:

`Capture once. Build the case. Send it with proof.`

Core promise:

- Capture once
- Keep the original safe
- Turn it into a transcript, facts, and timeline
- Identify the best valid routes
- Explain why those routes fit
- Prepare the packet
- Direct submit where possible
- Guide handoff everywhere else

The app combines three approved product modes into one identity:

- Field Witness: calm, minimal capture
- Consumer Advocate: route selection and reporting support
- Public Record: evidence quality, export, and credibility

## 2. Locked Decisions

- Mobile-only installable web app
- U.S.-focused for v1
- Consumer/business/civil reporting first
- Emergency reporting supported but not centered
- Google login required
- Filing flow is mandatory
- Evidence integrity is mandatory
- Routing registry is a first-class product system
- Route data must be source-backed
- The app must not be designed as "auto-report to anything"
- The app should be local-first with a minimal backend where security and reliability require it
- Direct share/export behavior is a first-class feature

## 3. Voice And User-Facing Language

Voice rules:

- calm
- procedural
- precise
- plain language
- slightly investigative
- never theatrical
- never bureaucratic
- never startup-marketing language

Preferred vocabulary:

- capture
- case
- evidence
- facts
- source
- verified
- trust
- route
- packet
- proof
- handoff
- log

Avoid:

- journey
- insights
- smart
- magic
- escalation
- jurisdictional
- forensic artifact
- mission
- tactical
- surveillance
- neural

## 4. Navigation And Screen Titles

Primary navigation:

- Capture
- Cases
- Routes
- Settings

Approved screen titles:

- Open Dossier
- Verify your account
- Secure this device
- Unlock case access
- Capture
- Capture saved
- Transcript
- Facts
- Recommended routes
- Draft report
- Send or hand off
- Proof of action
- Case file
- Export case file
- Settings

## 5. Visual System

### 5.1 Unified Visual Direction

Approved hybrid visual system:

- Black File onboarding
- Night Ledger recorder
- Paper Trail case flow

Design rule:

The app transitions from cinematic and immersive during onboarding and capture to structured and trustworthy during review and reporting.

### 5.2 Onboarding: Black File

- Premium dark glass
- Large typography
- One action per screen
- Secure and polished
- Modern fintech / premium productivity pacing

Visual traits:

- obsidian and graphite surfaces
- large editorial-style headline scale
- restrained highlights
- soft glass depth
- slow fade and lift transitions

### 5.3 Recorder: Night Ledger

- central focal control
- evidence-core orb
- subtle waveform field
- dark and investigative
- precise, cinematic, premium
- only one primary control

Visual traits:

- centered record orb as the emotional focal point
- low-contrast waveform texture
- faint precision ring and minimal signal states
- near-black field with restrained cool accent

### 5.4 Case Flow: Paper Trail

- structured legal / case-management feel
- cleaner and more readable after capture
- sections for Facts, Recommended routes, Draft report, Evidence, Log
- serious and trustworthy
- mobile-first

Visual traits:

- cleaner dossier/document surfaces
- stronger dividers and content hierarchy
- reduced motion
- high readability

### 5.5 Themes

Two global themes are approved:

- Slate: dark, field-ready, investigative
- Paper: light, official, report-focused

Theme toggle rules:

- one global theme toggle
- theme toggle is outside the recorder screen
- recorder stays visually consistent with the approved capture tone

## 6. UX Rules

### 6.1 Recorder Rules

- One primary control only: the large record toggle
- Use `Start capture` / `Stop capture` for the primary recorder label
- No pause button
- No save button
- No analyze button
- No upload button
- No submit button
- No route controls on the recorder
- No large cards during recording
- Small passive elements are allowed:
  - status
  - elapsed time
  - lock state
  - location state
- Advanced options stay off this screen
- Recording auto-saves continuously

### 6.2 Post-Capture Rules

- The app moves into a guided review flow
- Originals and AI outputs are always visually separated
- Facts should point back to transcript ranges where possible
- Business and location matches must be confirmable by the user
- Routes must feel grounded in real sources
- Route cards must show:
  - why this route fits
  - source
  - last verified
  - trust
  - intake method
  - required fields or documents
- Sending is never blind
- Direct send appears only where supported
- Guided handoff is the fallback everywhere else
- Emergency paths appear only when relevant and never dominate the product

## 7. Detailed Mobile UX Flow

### 7.1 Screen Sequence

1. Open Dossier
2. Verify your account
3. Secure this device
4. Unlock case access
5. Capture
6. Capture saved
7. Transcript
8. Facts
9. Recommended routes
10. Draft report
11. Send or hand off
12. Proof of action
13. Case file
14. Export case file
15. Settings

### 7.2 Screen Specifications

#### Open Dossier

Purpose:

- set product tone
- explain core value
- support install prompt

Primary copy:

- `Capture once. Build the case. Send it with proof.`

Primary action:

- `Continue`

#### Verify your account

Purpose:

- establish required app identity

Primary copy:

- `Use Google to open Dossier on this device.`

Primary action:

- `Continue with Google`

#### Secure this device

Purpose:

- configure local protection and basic setup

Sub-steps:

- device lock
- theme selection
- permissions
- AI mode selection

Primary action:

- `Continue`

#### Unlock case access

Purpose:

- reopen access to local case data

Primary action:

- `Unlock`

#### Capture

Purpose:

- start and stop audio capture

Primary elements:

- title
- elapsed time
- evidence-core orb
- passive state row

Primary action:

- `Start capture` / `Stop capture`

#### Capture saved

Purpose:

- confirm local save
- confirm initial evidence handling
- move user into review flow

Required copy:

- `The original capture is stored on this device. A hash and log entry have been created.`

Primary action:

- `Review case`

#### Transcript

Purpose:

- show captured audio as text

Required elements:

- full transcript
- timestamps
- segment-level source reference

Primary action:

- `Continue`

#### Facts

Purpose:

- present extracted facts for confirmation

Required sections:

- Case type
- People named
- Place
- Business
- Phone numbers
- Dates
- Amounts
- Timeline
- Key facts

Primary action:

- `Confirm facts`

Secondary actions:

- `Edit facts`
- `Review transcript`

#### Recommended routes

Purpose:

- show best valid reporting destinations

Route group order:

1. Business
2. Local
3. State
4. Federal
5. Other verified routes

Route card fields:

- destination name
- destination type
- why this route fits
- source
- last verified
- trust
- how to send
- what you may need

Primary action:

- `Choose route`

#### Draft report

Purpose:

- prepare destination-aware report text and packet

Required elements:

- selected route
- subject
- editable report text
- attached proof summary
- required details
- required files

Primary action:

- `Approve draft`

Secondary actions:

- `Edit draft`
- `Share packet`
- `Export packet`

#### Send or hand off

Purpose:

- complete reporting action

Available actions vary by route:

- `Open official form`
- `Send by email`
- `Call`
- `Share packet`
- `Export packet`
- `Save for later`

Required helper copy:

- `Use this step to send the report or hand off the packet.`
- `Dossier records the action in the case log.`

Primary action:

- `Continue`

#### Proof of action

Purpose:

- save what was sent and any confirmation returned

Required fields:

- Action taken
- Sent to
- Confirmation number
- Proof note
- Attached proof

Primary action:

- `Save proof`

#### Case file

Purpose:

- present the full case record

Required sections:

- Facts
- Recommended routes
- Draft report
- Evidence
- Log
- Proof of action

#### Export case file

Purpose:

- build packet for storage, sharing, or handoff

Export options:

- report PDF
- transcript text
- original audio
- log
- proof of action
- ZIP packet

Primary action:

- `Create export`

#### Settings

Purpose:

- manage minimal app configuration

Required sections:

- Account
- Device lock
- Theme
- Permissions
- AI mode
- Storage
- Legal

### 7.3 Screen-State Matrix

#### Capture

`empty`

- first authenticated load with no active case selected
- status shows `Ready to capture`
- primary control shows `Start capture`

`loading`

- initializing microphone
- checking permissions
- checking location state

`ready`

- recorder is available
- evidence core is idle
- timer and passive status fields are available
- primary control is active

`partial`

- capture is available but location is unavailable
- capture is available but level preview is unavailable
- copy example: `Location was not available for this capture.`

`error`

- microphone permission denied
- recorder setup failed
- local save failed
- copy examples:
  - `Microphone access is required to capture audio.`
  - `This capture could not be saved. Try again.`

`offline/deferred`

- local capture remains available
- transcript, facts, and routes are deferred until processing is available
- copy example: `Capture is available offline. Review and route checks will continue when you reconnect.`

#### Transcript

`empty`

- transcript has not started yet
- source audio summary is available

`loading`

- transcript is being created
- copy example: `Building transcript`

`ready`

- full transcript with timestamps is available

`partial`

- partial transcript is available while processing completes
- transcript is available but some segments have low confidence
- copy example: `Some sections may need review.`

`error`

- transcript request failed
- processing upload failed
- copy example: `Transcript could not be created right now.`

`offline/deferred`

- audio is saved locally
- transcript waits for connection or local AI mode
- copy example: `This capture is saved. Transcript will begin when you reconnect.`

#### Facts

`empty`

- no extracted facts are available yet

`loading`

- case type, people, place, business, timeline, and key facts are being prepared
- copy example: `Reviewing facts`

`ready`

- extracted facts are ready for confirmation

`partial`

- some fact groups are available but others are incomplete
- business or place match may be missing
- copy examples:
  - `Some facts need review.`
  - `Business details were not fully matched.`

`error`

- fact extraction failed
- extracted output could not be used
- copy example: `Facts could not be prepared right now.`

`offline/deferred`

- transcript is available locally
- fact extraction waits for connection or local AI mode
- copy example: `Facts will be prepared when processing is available.`

#### Recommended routes

`empty`

- route checks have not started
- place or case type confirmation may still be missing

`loading`

- venue match is being checked
- verified routes are being checked
- ranking is being prepared
- copy example: `Checking verified routes`

`ready`

- ranked route groups are available
- each route includes source, verified date, trust, and required actions

`partial`

- some route groups are available but one or more are incomplete
- business match may be missing while agency routes are still available
- some route details may be stale
- copy examples:
  - `No verified business match was found.`
  - `Some route details could not be verified today.`

`error`

- route data could not be loaded
- no valid route list could be assembled
- copy example: `Route data could not be loaded right now.`

`offline/deferred`

- last saved route snapshot may be shown
- fresh verification and ranking wait for connection
- copy example: `Verified route checks will continue when you reconnect.`

#### Draft report

`empty`

- no route selected yet
- no draft created yet

`loading`

- route-aware draft is being prepared
- proof references are being attached
- copy example: `Preparing draft`

`ready`

- draft subject, body, proof list, and route notes are available

`partial`

- base draft is available but some route-specific details are still missing
- copy example: `Draft is ready. Some route details still need review.`

`error`

- draft generation failed
- draft save failed
- copy example: `Draft could not be prepared right now.`

`offline/deferred`

- existing local draft can still be edited
- new AI draft generation waits for connection unless local AI mode is active
- copy example: `You can keep editing. A new draft can be prepared when processing is available.`

#### Send or hand off

`empty`

- no route has been chosen
- no approved draft is available

`loading`

- send options are being prepared
- export packet may be building
- email preview may be loading
- copy example: `Preparing send options`

`ready`

- valid send and handoff methods are available for the selected route

`partial`

- some methods are unavailable for the route
- direct send may be unavailable while handoff and export remain available
- copy example: `Direct send is not available for this route. Use handoff or export.`

`error`

- send options failed to load
- route action could not be opened
- copy example: `Send options could not be prepared right now.`

`offline/deferred`

- local export and some share actions remain available
- online route actions wait for connection
- copy example: `Export and local handoff are available offline. Online send options will return when you reconnect.`

#### Export case file

`empty`

- no export has been created yet
- export options are available

`loading`

- packet assembly is in progress
- PDF or ZIP generation is in progress
- copy example: `Creating export`

`ready`

- export is complete
- share and save actions are available

`partial`

- export completed with some items omitted
- copy example: `Export is ready with some items omitted.`

`error`

- export generation failed
- copy example: `This export could not be created.`

`offline/deferred`

- local export remains available
- backend-assisted processing waits for connection
- copy example: `Basic export is available offline. Additional processing will continue when you reconnect.`

## 8. Sharing And Export

Sharing is a first-class product feature.

MVP sharing goals:

- share through native mobile share sheet when available
- support common handoff behavior like any normal mobile share function
- allow text, file, and packet sharing
- write share/export actions to the case log

Supported share targets in MVP:

- email
- messaging apps
- social apps via share sheet if supported by the receiving app
- file-based handoff to other apps

Share surfaces:

- Draft report
- Send or hand off
- Proof of action
- Case file
- Export case file

Supported shared items:

- report text
- PDF report
- transcript text file
- original audio file
- ZIP packet

Platform behavior:

- use Web Share API where supported
- fall back to email, copy, open link, and download flows where needed
- direct hosted public links are not in MVP

Every share or export action must create a log entry.

## 9. Product Promise Boundaries

Dossier is not designed as "auto-report to anything."

Dossier is designed to:

- identify the best valid routes
- explain why they fit
- prepare the packet
- direct submit where possible
- guide handoff everywhere else

Dossier must not:

- invent agencies
- invent complaint URLs
- invent phone numbers
- invent destination contact details
- claim direct submission where it is not supported

## 10. Routing Registry

The routing registry is a first-class product system.

Its role is to:

- store canonical destination records
- define route coverage and rules
- track verification status
- support ranking and explanation
- make route recommendations grounded in real sources

### 10.1 Required Destination Fields

Every destination must include:

- destination name
- destination type
- jurisdiction
- categories handled
- intake methods
- complaint URL
- email
- phone
- mailing address if applicable
- source URL
- last verified date
- confidence / trust level
- notes on required fields or documents

### 10.2 Route Grouping In The UI

Routes must be shown in this order:

1. Business
2. Local
3. State
4. Federal
5. Other verified routes

### 10.3 Trust Labels

User-facing trust labels:

- Official
- Verified
- Directory
- Unconfirmed

### 10.4 Registry Data Model

#### destination

- `id`
- `destination_name`
- `destination_type`
- `jurisdiction_country`
- `jurisdiction_state`
- `jurisdiction_county`
- `jurisdiction_city`
- `categories_handled_json`
- `source_url`
- `last_verified_date`
- `trust_level`
- `status`

#### destination_intake

- `id`
- `destination_id`
- `intake_method`
- `complaint_url`
- `email`
- `phone`
- `mailing_address_json`
- `notes_required_fields`
- `notes_required_documents`

#### destination_rule

- `id`
- `destination_id`
- `incident_categories_json`
- `business_types_json`
- `jurisdiction_rules_json`
- `priority_weight`
- `exclusions_json`
- `reason_template`

#### verification_record

- `id`
- `destination_id`
- `source_url`
- `checked_at`
- `result`
- `change_summary`
- `checked_by`
- `next_review_due`

#### venue_match_cache

- `id`
- `provider`
- `place_id`
- `business_name`
- `address`
- `phone`
- `website`
- `lat`
- `lng`
- `captured_at`

#### incident_route_recommendation_snapshot

- `id`
- `incident_id`
- `destination_id`
- `route_category`
- `rank`
- `reason`
- `source_label`
- `source_url`
- `last_verified_date`
- `trust_level`
- `available_actions_json`

### 10.5 Registry Rules

- Every route shown to the user must be backed by a destination record or a stored venue match
- AI can classify, rank, and explain
- AI cannot invent destination data
- Route cards must freeze a snapshot of source, verified date, and trust level when shown

## 11. Architecture Overview

Approved architecture:

- local-first mobile app
- minimal backend for security, AI access, and routing support

The client is the canonical home for:

- original evidence
- local hash records
- local custody log
- packet assembly
- submission proof saved by the user

The backend is responsible for:

- Google identity verification
- AI access
- routing registry
- venue lookup support
- source verification jobs
- route recommendation assembly

## 12. Frontend Technical Stack

- React 19
- TypeScript
- Vite
- React Router
- TanStack Query
- Zustand
- Dexie on IndexedDB
- vite-plugin-pwa
- Workbox
- React Hook Form
- Zod
- pdf-lib
- JSZip
- MediaRecorder
- Web Audio API
- Web Crypto API
- Geolocation API
- Web Share API
- Clipboard API

### 12.1 Frontend Responsibilities

- Google sign-in initiation
- local unlock flow
- capture and file upload
- local hashing
- local log creation
- transcript and facts display
- route review and selection
- report editing
- share/export/handoff UI
- local case storage

## 13. Backend Technical Stack

- Node.js 22
- TypeScript
- Fastify
- PostgreSQL 16
- Prisma
- pg-boss
- Firebase Admin SDK
- OpenAI Node SDK
- S3-compatible object storage for short-lived processing copies

### 13.1 Backend Services

#### Auth Service

- verify Google identity token
- create app session
- manage session refresh

#### AI Gateway

- transcription
- fact extraction
- route reasoning support
- draft generation

#### Routing Registry API

- serve destination records
- serve route rules
- serve verification state

#### Venue Lookup Service

- resolve likely business matches from location and narrative

#### Verification Jobs

- re-check source URLs
- re-check route data freshness
- track verification history

#### Submission Support Service

- support email preview
- support route action metadata
- support later managed send features

#### Admin Registry Tools

- add records
- update records
- verify records
- review changes

## 14. Auth And AI Mode Plan

### 14.1 Identity

- Google login is required
- Google login is for app identity only
- Google login does not auto-link AI credentials

Preferred implementation:

- Firebase Auth on client
- Firebase Admin token verification on backend

### 14.2 Managed AI Mode

Managed AI mode is the default public mode.

Behavior:

- client authenticates with Google
- backend verifies identity
- backend owns protected OpenAI access
- client sends processing requests to backend
- client never receives permanent OpenAI credentials

### 14.3 BYO AI Key Mode

Supported in v1 for private or early use.

Behavior:

- user provides their own AI key locally
- key is stored encrypted on-device
- managed mode remains the preferred public architecture

### 14.4 AI Models

Approved model plan:

- transcription: `gpt-4o-transcribe`
- lower-cost transcription fallback: `gpt-4o-mini-transcribe`
- extraction and route reasoning support: `gpt-5.1-mini`
- report drafting: `gpt-5.1`

### 14.5 AI Rules

- AI may extract facts
- AI may classify case type
- AI may rank plausible routes
- AI may explain why a route fits
- AI may draft report text
- AI may not invent route contact data
- AI may not invent destination existence

## 15. Local Data Model

### 15.1 incident

- `id: uuid`
- `title: string`
- `status: 'capturing' | 'review' | 'drafting' | 'ready_to_send' | 'sent_or_handed_off' | 'closed'`
- `category: string | null`
- `created_at: iso`
- `updated_at: iso`
- `location_lat: number | null`
- `location_lng: number | null`
- `location_address: string | null`
- `place_id: string | null`
- `place_name: string | null`
- `place_phone: string | null`
- `current_route_snapshot_id: uuid | null`
- `current_draft_packet_id: uuid | null`
- `current_submission_proof_id: uuid | null`
- `current_export_evidence_id: uuid | null`

### 15.2 evidence_item

- `id: uuid`
- `incident_id: uuid`
- `type: 'audio' | 'upload' | 'transcript' | 'draft' | 'export' | 'proof'`
- `original: boolean`
- `integrity_status: 'pending' | 'verified' | 'mismatch'`
- `local_path: string`
- `mime_type: string`
- `size_bytes: number`
- `sha256: string`
- `captured_at: iso`
- `created_at: iso`
- `device_info_json`
- `source_evidence_id: uuid | null`

### 15.3 custody_log_entry

- `id: uuid`
- `incident_id: uuid`
- `evidence_item_id: uuid | null`
- `action: string`
- `actor: 'user' | 'system' | 'ai'`
- `details_json`
- `created_at: iso`
- `prev_hash: string | null`
- `entry_hash: string`

### 15.4 transcript_segment

- `id: uuid`
- `incident_id: uuid`
- `evidence_item_id: uuid`
- `start_ms: number`
- `end_ms: number`
- `speaker_label: string | null`
- `text: string`
- `confidence: number | null`

### 15.5 fact_set

- `id: uuid`
- `incident_id: uuid`
- `incident_type: string | null`
- `people_json`
- `places_json`
- `businesses_json`
- `phones_json`
- `dates_json`
- `amounts_json`
- `timeline_json`
- `key_facts_json`
- `reviewed_by_user: boolean`

### 15.6 route_recommendation_snapshot

- `id: uuid`
- `incident_id: uuid`
- `destination_id: uuid | null`
- `destination_name_snapshot: string`
- `destination_type_snapshot: string`
- `route_category: string`
- `rank: number`
- `reason: string`
- `source_label: string`
- `source_url: string | null`
- `last_verified_date: date | null`
- `trust_level: 'official' | 'verified' | 'directory' | 'unconfirmed'`
- `intake_methods_snapshot`
- `required_documents_snapshot`
- `available_actions_json`

### 15.7 draft_packet

- `id: uuid`
- `incident_id: uuid`
- `destination_id: uuid | null`
- `subject: string`
- `body: string`
- `attachments_json`
- `version: number`
- `approved: boolean`

### 15.8 submission_proof

- `id: uuid`
- `incident_id: uuid`
- `destination_id: uuid | null`
- `method: 'web_form' | 'email' | 'phone' | 'mail' | 'share'`
- `status: 'attempted' | 'sent' | 'submitted' | 'shared' | 'called' | 'saved'`
- `confirmation_number: string | null`
- `external_reference_url: string | null`
- `notes: string | null`
- `attachments_json`
- `created_at: iso`

### 15.9 custody_log_entry.details_json Shapes

The `details_json` field must use explicit event-specific payloads.

#### evidence_created

```json
{
  "event": "evidence_created",
  "evidence_id": "uuid",
  "evidence_type": "audio | upload | transcript | draft | export | proof",
  "original": true,
  "integrity_status": "pending | verified | mismatch",
  "sha256": "hex",
  "captured_at": "iso",
  "size_bytes": 12345,
  "mime_type": "audio/webm",
  "device_info": {},
  "location": {
    "lat": 0,
    "lng": 0,
    "address": "string | null"
  }
}
```

#### transcript_created

```json
{
  "event": "transcript_created",
  "evidence_id": "uuid",
  "transcript_evidence_id": "uuid",
  "source_evidence_id": "uuid",
  "segment_count": 0,
  "model": "string",
  "language": "string | null",
  "confidence_summary": {
    "average": 0
  }
}
```

#### facts_confirmed

```json
{
  "event": "facts_confirmed",
  "fact_set_id": "uuid",
  "incident_type": "string | null",
  "confirmed_fields": [
    "people",
    "place",
    "business",
    "timeline",
    "key_facts"
  ],
  "edited_fields": [
    "business"
  ],
  "reviewed_by_user": true
}
```

#### route_selected

```json
{
  "event": "route_selected",
  "route_snapshot_id": "uuid",
  "destination_id": "uuid | null",
  "destination_name_snapshot": "string",
  "destination_type_snapshot": "string",
  "route_category": "string",
  "rank": 1,
  "reason": "string",
  "source_url": "string | null",
  "last_verified_date": "date | null",
  "trust_level": "official | verified | directory | unconfirmed",
  "intake_methods_snapshot": [
    "web_form"
  ],
  "required_documents_snapshot": [
    "receipt",
    "audio file"
  ]
}
```

#### draft_approved

```json
{
  "event": "draft_approved",
  "draft_packet_id": "uuid",
  "destination_id": "uuid | null",
  "version": 1,
  "subject": "string",
  "attachment_count": 0
}
```

#### send_action_recorded

```json
{
  "event": "send_action_recorded",
  "submission_proof_id": "uuid | null",
  "destination_id": "uuid | null",
  "method": "web_form | email | phone | mail | share",
  "status": "attempted | sent | submitted | shared | called | saved",
  "target_label": "string",
  "external_reference_url": "string | null"
}
```

#### share_completed

```json
{
  "event": "share_completed",
  "shared_item_types": [
    "pdf",
    "audio"
  ],
  "share_method": "native_share | email | copy | download",
  "destination_hint": "string | null",
  "evidence_ids": [
    "uuid"
  ]
}
```

#### export_created

```json
{
  "event": "export_created",
  "export_evidence_id": "uuid",
  "export_format": "pdf | zip",
  "included_items": [
    "report",
    "transcript",
    "audio",
    "log"
  ],
  "sha256": "hex"
}
```

#### proof_saved

```json
{
  "event": "proof_saved",
  "submission_proof_id": "uuid",
  "destination_id": "uuid | null",
  "method": "web_form | email | phone | mail | share",
  "status": "attempted | sent | submitted | shared | called | saved",
  "confirmation_number": "string | null",
  "external_reference_url": "string | null",
  "attachment_count": 0
}
```

## 16. Evidence Integrity

Mandatory evidence integrity features:

- original file preservation
- SHA-256 hash on every original file
- append-only custody log
- export package

Integrity rules:

- original evidence is stored locally and treated as immutable
- every derivative must reference the original evidence hash
- every log entry is hash-linked
- every export or share action must be logged
- packet exports must include enough proof to trace back to the original capture

## 17. API Surface

### 17.1 Auth

`POST /v1/auth/google`

Input:

- Firebase ID token

Output:

- app session JWT
- user profile

`POST /v1/auth/logout`

`GET /v1/auth/session`

### 17.2 AI

`POST /v1/ai/transcribe`

Input:

- audio upload or temporary object reference
- evidence hash
- optional language hint

Output:

- transcript
- segment data
- model metadata

`POST /v1/ai/extract`

Input:

- transcript
- incident metadata

Output:

- category
- entities
- key facts
- timeline

`POST /v1/ai/draft`

Input:

- transcript
- facts
- selected route
- desired tone

Output:

- report draft
- subject suggestion
- attachment suggestions

### 17.3 Venue And Routing

`POST /v1/venue/match`

Input:

- latitude and longitude
- transcript excerpt
- optional business hints

Output:

- ranked place matches

`POST /v1/routes/recommend`

Input:

- incident facts
- confirmed place
- state and city context

Output:

- ranked routes
- reasons
- source metadata
- verification metadata
- intake actions

`GET /v1/routes/:destinationId`

Output:

- full destination detail

### 17.4 Submission Support

`POST /v1/submission/email-preview`

Purpose:

- build route-aware email subject and body

`POST /v1/submission/record-action`

Purpose:

- record selected send or handoff path and metadata

### 17.5 Registry Admin

`GET /v1/registry/version`

`POST /internal/registry/import`

`POST /internal/registry/verify`

## 18. Processing Flows

### 18.1 Sign-In Flow

1. User signs in with Google on the client
2. Client sends ID token to backend
3. Backend verifies token
4. Backend returns app session

### 18.2 Capture Flow

1. Client records audio locally
2. Client stores original file locally
3. Client computes SHA-256 locally
4. Client writes initial log entry
5. Client transitions to Capture saved

### 18.3 Analysis Flow

1. Client requests processing
2. Client uploads processing copy or temporary reference
3. Backend transcribes audio
4. Backend extracts facts
5. Backend returns transcript and fact set

### 18.4 Routing Flow

1. User confirms place or business match
2. Backend combines confirmed facts with routing registry and venue data
3. Backend ranks valid routes
4. Backend returns route cards with source and trust metadata
5. Client stores route snapshot locally

### 18.5 Draft Flow

1. User selects route
2. Backend generates route-aware draft
3. User edits and approves
4. Client logs draft approval

### 18.6 Send / Handoff Flow

1. User chooses send or handoff method
2. Client opens official form, email app, dialer, share sheet, or export flow
3. Client logs action
4. User saves proof of action

### 18.7 Export And Share Flow

1. Client assembles selected packet contents
2. Client creates PDF and/or ZIP
3. Client opens share sheet or fallback action
4. Client logs export/share event

## 19. Source Strategy

Route recommendations must feel grounded in real sources.

Primary source types:

- official federal agency sites
- official state agency and attorney general sites
- official city and county pages where practical
- verified business/place providers for venue data
- internal verification records

V1 should not rely on random web scraping for core route data.

## 20. Copy Reference For UI

Core line:

- `Capture once. Build the case. Send it with proof.`

Recorder labels:

- `Start capture`
- `Stop capture`

Key helper phrases:

- `The original capture is stored on this device.`
- `A hash and log entry have been created.`
- `These routes match the facts, location, and verified sources.`
- `Save what you sent, where it went, and any confirmation you received.`
- `The original capture has not changed.`

Trust labels:

- Official
- Verified
- Directory
- Unconfirmed

System statuses:

- Ready to capture
- Recording
- Capture saved
- Transcript ready
- Facts ready for review
- Routes ready
- Draft ready
- Export ready
- Proof saved

Warnings:

- `Location was not available for this capture.`
- `No verified business match was found.`
- `Some route details could not be verified today.`
- `Direct send is not available for this route. Use handoff or export.`

Errors:

- `Google sign-in did not complete. Try again.`
- `This capture could not be saved. Try again.`
- `Transcript could not be created right now.`
- `Route data could not be loaded right now.`
- `This export could not be created.`
- `The share action did not complete.`

## 21. Delivery Plan

1. Lock spec, schemas, and route-source standards
2. Build routing registry and verification workflow
3. Build auth service and AI gateway
4. Build local-first capture and evidence storage
5. Build review, facts, and route recommendation flow
6. Build draft, send/handoff, proof, share, and export flow
7. Test mobile installability, recording reliability, integrity logging, and share behavior
8. Prepare later hooks for AR/XR place anchors and spatial metadata

## 22. Open Items For Future Revision

The following may be revised later without changing the core architecture:

- final marketing wording
- final route-card phrasing
- exact theme tokens
- exact iconography
- exact visual animation timing
- exact route ranking heuristics
