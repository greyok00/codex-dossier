# Dossier Backend Implementation Plan

Status: Review artifact
Last updated: 2026-04-07
Source contracts:

- `/home/grey/codex-dossier/docs/TECH_SPEC.md`
- `/home/grey/codex-dossier/docs/OPENAPI.json`
- `/home/grey/codex-dossier/docs/SCHEMA.sql`

This document turns the locked product spec, API contract, and SQL schema into an implementation plan for the backend. It does not contain application code.

## 1. Backend Role

Dossier is local-first. The backend exists to do the work the client should not do directly.

Backend responsibilities:

- verify Google identity
- manage application sessions
- hold managed OpenAI credentials
- proxy AI requests safely
- serve the routing registry
- support venue lookup
- return source-backed recommended routes
- record send/handoff actions
- run route verification jobs

Backend non-goals for v1:

- storing canonical original evidence
- owning the primary custody log
- becoming the source of truth for local case files
- building a cloud-first case management system

## 2. Service Layout

Recommended backend shape:

- `api`: public HTTP API
- `worker`: async jobs for AI, verification, and refresh tasks
- `postgres`: relational data store
- `object storage`: short-lived processing copies only

Recommended runtime:

- Node.js 22
- TypeScript
- Fastify
- Prisma
- pg-boss
- PostgreSQL 16
- Firebase Admin SDK
- OpenAI Node SDK

## 3. Module Boundaries

### 3.1 Auth Module

Handles:

- `POST /v1/auth/google`
- `POST /v1/auth/logout`
- `GET /v1/auth/session`

Responsibilities:

- verify Firebase ID token
- find or create `app_user`
- issue session token
- store `app_session`
- revoke sessions
- attach current user to authenticated requests

### 3.2 AI Module

Handles:

- `POST /v1/ai/transcribe`
- `POST /v1/ai/extract`
- `POST /v1/ai/draft`

Responsibilities:

- validate request payloads
- accept short-lived audio processing copies
- call OpenAI models
- map outputs into contract-safe DTOs
- log model metadata in `ai_request_log`
- return deterministic response envelopes

### 3.3 Venue Module

Handles:

- `POST /v1/venue/match`

Responsibilities:

- normalize lat/lng and optional transcript excerpt
- call place provider
- rank likely business matches
- cache match responses in `venue_match_cache`
- return explicit source and trust fields

### 3.4 Routing Registry Module

Handles:

- `GET /v1/registry/version`
- `POST /v1/routes/recommend`
- `GET /v1/routes/{destinationId}`

Responsibilities:

- read destination records
- read intake methods and rule sets
- apply route rules to facts and confirmed place
- combine deterministic route candidates with AI ranking help
- return route groups in the locked order
- preserve source, verification date, and trust level in every recommendation

### 3.5 Submission Module

Handles:

- `POST /v1/submission/email-preview`
- `POST /v1/submission/record-action`

Responsibilities:

- create route-aware email previews
- validate submission proof payloads
- validate custody event payloads
- store `submission_action_record`
- return destination source snapshots for continuity

### 3.6 Internal Registry Module

Handles internal-only routes, not public API:

- `/internal/registry/import`
- `/internal/registry/verify`

Responsibilities:

- import verified route data
- schedule refresh checks
- record verification history
- support operator review and correction

## 4. Request Pipeline

### 4.1 Public Request Flow

1. receive request
2. assign `request_id`
3. verify bearer session except for `POST /v1/auth/google`
4. validate JSON body against contract
5. execute module handler
6. map internal objects to public DTO
7. return success or error envelope

### 4.2 Validation Rules

- reject unknown enum values
- reject missing required fields
- reject invalid route/source/trust combinations
- reject custody events whose `details_json.event` does not match the `action`
- reject AI draft requests without a selected route
- reject record-action requests without a full `submission_proof`

### 4.3 Error Strategy

Every public endpoint returns:

- success envelope: `ok: true`
- error envelope: `ok: false`

Error object fields:

- `code`
- `message`
- `retryable`
- `details`

Recommended backend error categories:

- `auth_invalid_token`
- `auth_session_expired`
- `validation_error`
- `file_too_large`
- `audio_upload_failed`
- `transcript_failed`
- `extract_failed`
- `draft_failed`
- `route_data_unavailable`
- `destination_not_found`
- `email_preview_failed`
- `record_action_failed`
- `internal_error`

## 5. Auth And Session Plan

### 5.1 Sign-In Flow

1. client completes Google sign-in through Firebase Auth
2. client sends `firebase_id_token`
3. backend verifies token with Firebase Admin
4. backend upserts `app_user`
5. backend creates `app_session`
6. backend returns signed session token

### 5.2 Session Design

- session token should be a signed JWT or opaque token with hashed lookup
- store only the hash in the database if using opaque tokens
- session should include `user_id` and `session_id`
- session lifetime should be short
- refresh can be handled by re-verifying current Firebase identity

### 5.3 Authorization Policy

- all public endpoints except `POST /v1/auth/google` require a valid session
- internal registry routes require a stronger internal operator role

## 6. AI Integration Plan

### 6.1 Managed Mode

Default public architecture:

- backend owns permanent OpenAI credentials
- client never receives permanent OpenAI credentials
- backend logs every AI request in `ai_request_log`

### 6.2 Model Routing

Recommended model mapping:

- `transcribe`: `gpt-4o-transcribe`
- fallback `transcribe`: `gpt-4o-mini-transcribe`
- `extract`: `gpt-5.1-mini`
- `route_reasoning`: `gpt-5.1-mini`
- `draft`: `gpt-5.1`

### 6.3 AI Safety Rules

- use AI for extraction, ranking help, explanation, and drafting
- never let AI invent destination names or contact data
- never let AI bypass registry/source checks
- keep route cards grounded in destination records or venue matches

### 6.4 AI Request Logging

For every AI request, record:

- user id if known
- client incident id
- purpose
- provider
- model
- request id
- requested_at
- completed_at
- latency
- token or audio metrics where available
- success or failure state

## 7. Audio Processing Plan

### 7.1 Accepted Upload Modes

- inline base64 for smaller payloads
- object storage reference for larger uploads

### 7.2 Temporary Processing Storage

Rules:

- store audio processing copies only as needed
- delete after processing or short TTL expiry
- never treat temporary storage as canonical evidence
- preserve `source_evidence_id` and `source_evidence_sha256` in request handling

### 7.3 Size Limits

Implement explicit request size ceilings:

- smaller sync limit for inline uploads
- larger async limit for object references

Return:

- `413` for oversized requests
- `422` for unsupported media or invalid audio payloads

## 8. Routing Registry Plan

### 8.1 Registry Data Sources

V1 source priorities:

- official federal sites
- official state agency and attorney general sites
- official city and county pages where practical
- verified place/business providers
- internal verification records

### 8.2 Registry Population

Phase order:

1. seed federal destination records
2. seed state destination records
3. add high-value local destinations where coverage is practical
4. implement recurring verification checks
5. add operator tooling for fixes and additions

### 8.3 Registry Integrity Rules

- every public route must resolve to a destination record or a live venue match
- each destination must include all required product fields
- every route returned to the client must expose:
  - source label
  - source URL
  - last verified date
  - trust level

### 8.4 Recommendation Assembly

Recommendation pipeline:

1. normalize fact set
2. normalize confirmed place
3. query rule-matching destinations
4. query relevant venue/business candidate if confirmed
5. build deterministic candidate list
6. optionally use AI to improve ordering and explanation text
7. group into locked route categories
8. return route groups

### 8.5 Route Ranking Rules

Hard ordering:

1. `Business`
2. `Local`
3. `State`
4. `Federal`
5. `Other verified routes`

Within each category, rank by:

- rule priority weight
- jurisdiction match quality
- category match quality
- confirmed place match quality
- trust level
- freshness of verification

## 9. Venue Match Plan

### 9.1 Inputs

- lat/lng
- optional address
- optional transcript excerpt
- optional business hints

### 9.2 Outputs

- ranked place matches
- business name
- address
- phone
- website
- provider
- source label
- source URL
- trust level
- capture time

### 9.3 Caching

- cache by provider and place id
- refresh stale records on demand
- preserve original provider identifiers

## 10. Submission And Proof Plan

### 10.1 Email Preview

The backend should:

- validate selected route
- validate draft packet
- create destination-aware email subject/body
- preserve destination snapshot fields in response

### 10.2 Record Action

The backend should:

- validate `submission_proof`
- validate `selected_route`
- validate `custody_event`
- ensure `custody_event.action` matches `details_json.event`
- store a `submission_action_record`
- return destination source snapshot and `server_reference_id`

### 10.3 Proof Semantics

The backend must not try to prove that a third-party site accepted a complaint unless it actually has a confirmation artifact. It records what the user did and what source-backed route they used.

## 11. Database Implementation Notes

### 11.1 Migration Order

1. enums
2. auth tables
3. registry tables
4. AI request log
5. submission action record
6. local reference tables
7. deferred continuity foreign keys

### 11.2 JSON Columns

Use JSONB for:

- categories handled arrays
- intake notes arrays
- rule arrays and rule objects
- attachments arrays
- custody event payloads
- local fact arrays
- local route snapshots

### 11.3 Constraints To Keep

- enum values must match product spec exactly
- JSONB shape checks must remain
- incident continuity foreign keys must stay deferred
- route snapshot rank must stay positive
- transcript confidence range must stay 0..1
- evidence original/source linkage check must remain

## 12. Internal Admin Surface

These routes are intentionally outside the public API contract and should be documented separately if exposed to operators:

- `POST /internal/registry/import`
- `POST /internal/registry/verify`

Recommended operator-only capabilities:

- import CSV or JSON route sources
- mark destinations inactive
- update verification dates
- queue re-verification
- compare source changes before publish

## 13. Security Plan

### 13.1 Secrets

- keep Firebase admin credentials server-side only
- keep OpenAI credentials server-side only
- rotate secrets through deployment environment controls

### 13.2 Data Handling

- do not store canonical originals on the backend by default
- minimize retention for temporary audio processing copies
- hash or tokenize session secrets
- log security-sensitive failures without exposing secrets

### 13.3 Abuse Controls

- rate-limit auth attempts
- rate-limit AI endpoints
- cap audio size and processing duration
- require valid session for expensive endpoints

## 14. Observability Plan

### 14.1 Structured Logs

Include:

- request id
- user id if present
- session id if present
- endpoint
- latency
- outcome
- upstream provider status for AI or place lookups

### 14.2 Metrics

Track:

- auth success/failure rates
- AI latency by purpose and model
- route recommendation latency
- destination cache hit rate
- venue lookup hit rate
- action-record success/failure rate
- verification job success/failure rate

### 14.3 Tracing

Trace:

- public request to module handler
- AI provider calls
- place provider calls
- queue job execution

## 15. Testing Plan

### 15.1 Contract Tests

- validate sample requests against OpenAPI schemas
- validate sample responses against OpenAPI schemas
- validate enum drift between OpenAPI and SQL

### 15.2 Integration Tests

- Firebase sign-in verification flow
- session creation and logout
- transcribe flow
- extract flow
- draft flow
- venue match flow
- route recommendation flow
- email preview flow
- record-action flow

### 15.3 Data Integrity Tests

- destination and intake constraints
- route ranking group order
- submission proof status enum handling
- custody event payload validation
- deferred continuity FK behavior in local reference schema

## 16. Delivery Sequence

### Phase 1: Core platform

- auth module
- session middleware
- public error envelope
- request validation
- Postgres migrations

### Phase 2: Registry and route backbone

- destination tables
- intake tables
- rule evaluation
- route recommendation response mapping
- registry version endpoint

### Phase 3: AI services

- transcribe handler
- extract handler
- draft handler
- AI request logging
- object storage flow for temporary uploads

### Phase 4: Venue and submission support

- venue match handler
- email preview handler
- record-action handler

### Phase 5: Internal operations

- registry import tooling
- verification jobs
- registry publish workflow

## 17. Backend Definition Of Done

The backend is ready for first implementation review when:

- all public endpoints conform to `OPENAPI.json`
- SQL migrations apply cleanly from `SCHEMA.sql`
- enum values match spec exactly
- auth works with Firebase ID tokens
- AI responses include model metadata
- route responses include explicit route/source/trust fields
- submission record actions validate custody event payloads
- registry endpoints return source-backed destination data only
