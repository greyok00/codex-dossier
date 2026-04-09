# codex-dossier

Dossier is a local-first incident capture and reporting app currently in active development.

Current build target is a local development frontend and backend. Final product target is a phone app (Android/iOS). The web app is the development shell, not the final distribution form.

Product line:

`Capture once. Build the case. Send it with proof.`

## Project status

This project is a work in progress.

- Core product spec and architecture are documented.
- Backend MVP endpoints are implemented and tested.
- Frontend local-first flow is implemented for MVP iteration.
- UI, model packaging, and mobile release steps are still in progress.

For detailed status and mobile target notes, see [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

## What Dossier does

- Captures incident evidence (voice-first in current MVP)
- Preserves original evidence with local hash + custody log
- Builds transcript and structured facts
- Recommends reporting destinations with source/trust fields
- Drafts reports and supports send/handoff/proof/export flows

## Architecture (current)

- Frontend: React + TypeScript + Vite + PWA + Dexie (local-first data)
- Local AI mode: Transformers.js + ONNX Runtime Web + deterministic extraction/routing logic
- Backend: Node.js + TypeScript + Fastify + PostgreSQL (registry/auth/integration surface)

## Important implementation note

Large local model assets can exceed standard GitHub file size limits. Repository commits should keep binary model files within git hosting limits. Full model packaging is intended for mobile app bundling later (APK/IPA assets).

## Repository layout

- `frontend/` React PWA client, local AI flow, local storage, UI
- `src/` backend runtime and API routes
- `test/` backend integration tests
- `docs/` product, schema, API, and implementation specs
- `tools/` import and utility tooling
- `generated/` generated registry/import artifacts

## Quick start (frontend)

```bash
cd frontend
npm install
npm run dev
```

Local checks:

```bash
cd frontend
npm run check
npm run test
npm run build
```

## Quick start (backend)

```bash
npm install
npm run dev
```

Postgres integration tests:

```bash
npm run db:test:up
npm run test:integration:pg
npm run db:test:down
```

## Documentation index

- [docs/TECH_SPEC.md](docs/TECH_SPEC.md)
- [docs/OPENAPI.json](docs/OPENAPI.json)
- [docs/SCHEMA.sql](docs/SCHEMA.sql)
- [docs/FRONTEND_TYPE_MAP.md](docs/FRONTEND_TYPE_MAP.md)
- [docs/BACKEND_IMPLEMENTATION_PLAN.md](docs/BACKEND_IMPLEMENTATION_PLAN.md)
- [docs/ROUTING_REGISTRY_MIGRATION_AND_SEED_PLAN.md](docs/ROUTING_REGISTRY_MIGRATION_AND_SEED_PLAN.md)

## Current direction

- Keep local-first behavior for evidence and case data
- Keep UX plain, procedural, and mobile-first
- Ship as a phone app when product and packaging are complete
