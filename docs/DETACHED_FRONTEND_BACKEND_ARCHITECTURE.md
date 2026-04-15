# Detached Frontend/Backend Architecture

Status: active rebuild target
Date: 2026-04-13

## Goal

Make the Dossier frontend a detached control and case-work shell that can reload independently while the backend remains a stable long-running process.

## Runtime Boundary

- Frontend owns:
  - rendering
  - local IndexedDB case state
  - local/offline AI mode
  - backend health display
  - backend reconnect behavior
- Backend owns:
  - server APIs
  - registry/auth/venue/submission integrations
  - stable process lifetime
  - health endpoint

## Stability Rules

- Frontend reload or crash must not imply backend restart.
- Backend restart must not require frontend rebuild or restart.
- Frontend must degrade gracefully when backend is unavailable.
- Local-first case work must remain usable in detached mode.
- Shared configuration must come from one repo-root env source.

## Unified Configuration

Repo-root `.env` / `.env.local` is the single configuration source.

Backend keys:

- `DATABASE_URL`
- `HOST`
- `PORT`
- `INTERNAL_REGISTRY_API_KEY`
- `OPENAI_*`
- `GOOGLE_PLACES_API_KEY`

Frontend public keys:

- `VITE_DOSSIER_RUNTIME_MODE`
- `VITE_DOSSIER_API_MODE`
- `VITE_DOSSIER_BACKEND_URL`
- `VITE_DOSSIER_BACKEND_HEALTH_PATH`
- `VITE_DOSSIER_APP_TITLE`

## Frontend Operating Modes

- `local`
  - frontend uses local AI/runtime only
  - backend is optional
  - preferred detached default for resilience
- `backend`
  - frontend uses backend API endpoints for AI/integration surfaces
  - frontend still stays bootable if backend is down and should surface degraded status

## Immediate Implementation Notes

- Backend health endpoint: `GET /v1/health`
- Frontend Vite config reads repo-root env via `envDir: ".."`
- New UI rebuild should consume `frontend/src/lib/config.ts`
- New UI should expose backend status without making backend availability a boot blocker
