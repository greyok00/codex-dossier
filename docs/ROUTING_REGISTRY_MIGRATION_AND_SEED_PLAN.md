# Dossier Routing Registry Migration And Seed Plan

Status: Review artifact
Last updated: 2026-04-07
Source contracts:

- `/home/grey/codex-dossier/docs/TECH_SPEC.md`
- `/home/grey/codex-dossier/docs/OPENAPI.json`
- `/home/grey/codex-dossier/docs/SCHEMA.sql`
- `/home/grey/codex-dossier/docs/BACKEND_IMPLEMENTATION_PLAN.md`

This document covers two things:

- SQL migration notes for bringing the backend and local reference schema online safely
- a phased seed plan for the routing registry

This is still pre-build planning. No application code is included.

## 1. Goals

The migration and seed plan should:

- bring the schema online without enum drift
- keep public route data source-backed
- support U.S.-wide v1 routing
- prioritize consumer, business, and civil reporting first
- keep emergency support present but secondary
- make route recommendations credible on day one

## 2. SQL Migration Notes

### 2.1 Migration Scope

The SQL schema covers three layers:

- `dossier_enum`: shared enums
- `dossier_backend`: backend runtime tables
- `dossier_local`: local-first reference schema for client persistence shape

The backend must apply and manage:

- `dossier_enum`
- `dossier_backend`

The `dossier_local` schema is a relational reference model for local storage shape. It should be used to guide IndexedDB/Dexie structure and validation. It does not need to be deployed as a server-owned production schema unless you want a mirrored test database.

### 2.2 Migration Order

Apply migrations in this order:

1. extensions
2. schemas
3. enums
4. auth tables
5. routing registry tables
6. AI request log table
7. submission action table
8. local reference tables
9. deferred continuity foreign keys
10. indexes that depend on the full table graph

### 2.3 Transaction Strategy

Use transactional migrations for:

- enum creation
- table creation
- constraint creation
- index creation unless your migration runner requires concurrent index creation

Avoid partial applies. Either the migration set succeeds or the database stays unchanged.

### 2.4 Enum Policy

Enum values are contract-locked.

Rules:

- do not rename enum values in place
- do not reorder enum values for meaning
- only append values if the product spec changes later
- update `OPENAPI.json`, `SCHEMA.sql`, and `FRONTEND_TYPE_MAP.md` together if a new enum value is ever introduced

Critical locked enums:

- `destination_type_enum`
- `intake_method_enum`
- `trust_level_enum`
- `incident_status_enum`
- `evidence_item_type_enum`
- `integrity_status_enum`
- `custody_actor_enum`
- `custody_action_enum`
- `submission_method_enum`
- `submission_status_enum`
- `route_category_enum`
- `ai_purpose_enum`

### 2.5 Foreign Key Strategy

Backend FKs:

- keep backend FKs immediate and strict
- destination children should cascade on destination delete
- user-linked runtime records should usually use `ON DELETE SET NULL` unless ownership is mandatory

Local reference FKs:

- continuity pointers on `dossier_local.incident` must stay `DEFERRABLE INITIALLY DEFERRED`
- this is required because an incident may be written before its current route, draft, proof, or export pointer is finalized in the same transaction

### 2.6 JSONB Policy

JSONB columns are acceptable where the product needs flexible arrays or event payloads.

Do not move the following to weak text blobs:

- categories handled
- intake notes arrays
- rule arrays
- verification deltas
- attachments arrays
- custody event payloads
- route action arrays

If JSONB shapes become unstable, add application-level validation before adding more SQL checks.

### 2.7 Constraint Notes

Do not remove these checks:

- route rank must be positive
- transcript confidence must be between 0 and 1
- `updated_at >= created_at` where defined
- `integrity_status` must use the locked enum
- local original evidence must not point to a source evidence row
- destination intake must have at least one usable contact path
- route snapshot arrays must stay arrays

### 2.8 Indexing Notes

High-value backend indexes are already defined for:

- destination lookup by jurisdiction
- trust/freshness sorting
- rule lookup
- verification history
- session lookup and expiry
- AI log lookup
- submission action lookup

Before production load testing, validate:

- route recommendation query plans by state and category
- destination rule JSONB GIN selectivity
- session cleanup query performance
- verification job query performance

### 2.9 Migration Verification Checklist

After migrations run:

- confirm all enum names and values match the locked spec
- confirm all schemas exist
- confirm all FK constraints are present
- confirm deferred continuity FKs exist on `dossier_local.incident`
- confirm unique indexes were created
- confirm JSONB shape checks were applied
- confirm no unexpected nullable columns were introduced

### 2.10 Rollback Notes

Treat enum and table creation as forward-only in shared environments.

Rollback policy:

- for local/dev: drop and recreate if needed
- for staging/prod: use corrective follow-up migrations, not destructive rollback

Do not plan to remove seeded route data by dropping tables once data review begins.

## 3. Routing Registry Seed Plan

### 3.1 Seed Strategy

The routing registry should be seeded in layers.

Principle:

- start with the highest-confidence government routes first
- then add high-value state-level complaint systems
- then add verified non-government consumer routes
- then add selected local routes
- keep business-specific routing as live lookup, not seeded canonical data

### 3.2 What Gets Seeded vs Looked Up Live

Seed these:

- federal agencies
- state agencies
- state attorney general and consumer complaint routes
- state labor, civil rights, housing, insurance, utilities, and similar complaint routes
- selected national consumer organizations
- selected local government complaint destinations where practical

Do not try to fully seed these:

- all businesses
- all venue-specific contacts
- all branch-level business records

Business routing should come from live place lookup plus route rules.

### 3.3 V1 Priority Coverage

Priority order for v1:

1. federal complaint routes
2. state attorney general and state consumer routes for all 50 states plus D.C.
3. state labor and employment complaint routes
4. state civil rights / human rights routes
5. housing and tenant complaint routes where centrally published
6. insurance, utilities, health, and licensing complaint routes where clearly public
7. Better Business Bureau and similar verified consumer routes
8. selected local complaint routes in major metros
9. non-emergency law enforcement directory references where useful

Emergency support should not drive the first seed batch.

### 3.4 Destination Record Rules

Each seeded destination must include:

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
- trust level
- notes on required fields or documents

Reject any seed row that cannot fill the required fields at acceptable quality.

### 3.5 Trust-Level Policy

Use trust levels conservatively:

- `official`: direct government or official organization source
- `verified`: high-confidence source checked against official material
- `directory`: useful route from a reputable directory or provider, but not direct official ownership
- `unconfirmed`: should not appear in normal v1 seed imports except in clearly flagged operator review workflows

Default seed rule:

- government routes should be `official`
- BBB-style routes may be `verified` or `directory` depending on source path

### 3.6 Seed Batches

#### Batch 1: Federal Core

Seed:

- FTC
- CFPB
- EEOC
- OSHA
- DOJ civil rights routes where clearly public
- HUD complaint routes where applicable
- other national complaint systems directly tied to common v1 categories

Why first:

- broad coverage
- high trust
- stable public complaint endpoints

#### Batch 2: State Attorney General And Consumer Offices

Seed for all states and D.C.:

- attorney general complaint portal
- state consumer protection office if separate
- public complaint phone and mailing address
- required field notes where visible

Why second:

- this is core to the product promise for consumer and business complaints

#### Batch 3: State Labor And Employment

Seed:

- wage complaint routes
- labor standards complaint routes
- state employment discrimination complaint routes where state-first handling exists

Why third:

- strong consumer/civil demand
- often state-specific and not obvious to users

#### Batch 4: Civil Rights, Housing, Utilities, Insurance, Health, Licensing

Seed state routes where a public complaint function is clear:

- civil rights / human relations
- tenant or housing complaint offices
- utilities regulators
- insurance complaint offices
- public health complaint systems
- business licensing complaint systems

Why fourth:

- these routes materially improve routing quality
- they need curated rules and cannot be guessed safely

#### Batch 5: Verified Consumer Organizations

Seed:

- Better Business Bureau
- national complaint or mediation organizations only where useful and stable

Why fifth:

- useful fallback path
- should not outrank official agency routes when a better official route exists

#### Batch 6: Selected Local Routes

Seed only where the source quality is good and maintenance is manageable:

- city consumer affairs offices
- county health complaint lines
- city code enforcement complaint portals
- local non-emergency report paths for major metros

Why sixth:

- useful, but maintenance cost is higher
- local route quality varies heavily

### 3.7 Business Route Strategy

Business routes are not seeded as a global registry.

Instead:

- resolve business identity from place lookup
- attach public business phone, site, and address
- treat business route cards as source-backed live venue matches
- map the business into the `Business` route group
- optionally add a second `corporate` route if a curated national complaint path exists for that brand later

### 3.8 Rule Authoring Plan

Every seeded destination should have at least one `destination_rule`.

Minimum rule fields:

- incident categories
- business types when relevant
- jurisdiction match logic
- priority weight
- exclusions
- reason template

Reason templates should produce plain-language output, for example:

- `This route fits a consumer complaint about a retail transaction in Arizona.`
- `This route fits a wage complaint reported in California.`
- `This route matches a housing-related complaint in Phoenix.`

### 3.9 Suggested Seed Taxonomy

Use a controlled category vocabulary for seed authoring. Start with:

- consumer_billing
- retail_transaction
- service_quality
- fraud_or_deception
- workplace_wages
- workplace_discrimination
- housing_condition
- tenant_issue
- civil_rights
- utility_issue
- insurance_issue
- health_or_sanitation
- licensing_or_professional_conduct
- police_non_emergency

This taxonomy can stay internal. User-facing copy should remain plain.

### 3.10 Seed Input Formats

Recommended operator input formats:

- CSV for bulk destination import
- JSON for richer intake/rule payloads

Suggested seed source files:

- `seed/federal_destinations.csv`
- `seed/state_consumer_routes.csv`
- `seed/state_labor_routes.csv`
- `seed/state_civil_housing_routes.csv`
- `seed/consumer_org_routes.csv`
- `seed/local_priority_routes.csv`

### 3.11 CSV Import Shape

Recommended flat import columns:

- destination_name
- destination_type
- jurisdiction_country
- jurisdiction_state
- jurisdiction_county
- jurisdiction_city
- categories_handled
- intake_method
- complaint_url
- email
- phone
- mailing_address_line1
- mailing_address_line2
- mailing_address_city
- mailing_address_state
- mailing_address_postal_code
- source_url
- last_verified_date
- trust_level
- notes_required_fields
- notes_required_documents
- incident_categories
- business_types
- priority_weight
- exclusions
- reason_template

Use pipe-separated lists in CSV for list fields if needed, then normalize on import.

The flat CSV shape uses one `intake_method` per row. If a destination supports multiple intake paths, expand it into multiple `destination_intake` records during import by merging rows on the normalized destination key or by using the richer JSON seed format.

### 3.12 Import Pipeline

Import steps:

1. parse source file
2. normalize whitespace, URLs, phone formats, and state names
3. validate required fields
4. upsert `destination`
5. upsert `destination_intake`
6. upsert `destination_rule`
7. write `verification_record`
8. produce import report with accepted, skipped, and rejected rows

### 3.13 Seed Quality Gates

A route should not be published to production unless:

- source URL resolves and is appropriate
- trust level is set correctly
- complaint URL or other intake path is present
- last verified date is set
- at least one route rule exists
- required documents and fields are captured where possible
- route category behavior is understood

### 3.14 Verification Cadence

Suggested review cadence:

- federal routes: every 30 days
- state routes: every 30 to 45 days
- local routes: every 14 to 30 days where possible
- BBB and similar verified routes: every 30 days

Trigger early re-checks when:

- form submission failures spike
- users report dead links
- operators modify a rule

### 3.15 Publish Workflow

Recommended workflow:

1. import into staging registry state
2. validate and review changes
3. diff against current published set
4. run spot checks on high-priority destinations
5. publish a new `registry_version`
6. expose version through `GET /v1/registry/version`

### 3.16 Seed Ownership

Assign explicit ownership:

- federal routes owner
- state routes owner
- local routes owner
- verification owner
- taxonomy/rule owner

Do not leave registry maintenance as an unowned side task.

## 4. Suggested First Seed Milestone

Ship-ready minimum target:

- federal core seeded and verified
- attorney general / consumer complaint routes for all 50 states and D.C.
- top labor and civil-rights routes for all 50 states and D.C.
- BBB route included as verified fallback
- selected local routes for top launch metros
- route rules written for the top 10 to 15 internal incident categories

This gives the product credible national coverage without pretending every possible local route is complete.

## 5. Pre-Implementation Deliverables

Before writing import code, prepare:

- canonical category taxonomy sheet
- first batch CSV or JSON seed files
- destination normalization rules
- URL and phone normalization rules
- trust-level decision guide
- verification checklist for operators

## 6. Review Checklist

Approve this plan when all of the following are true:

- migration order is accepted
- enum policy is accepted
- local schema treatment is accepted
- v1 seed coverage is accepted
- category taxonomy is acceptable
- trust-level rules are acceptable
- batch order is acceptable
- publish workflow is acceptable

## 7. Recommended Next Step

After this plan, the next highest-value artifact is:

- a routing registry seed template pack

That pack should include:

- CSV column definitions
- JSON import examples
- first-pass category taxonomy
- first-pass federal and state destination seed rows
