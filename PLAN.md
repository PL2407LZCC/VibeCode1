# Delivery Plan

This living plan breaks the build into milestones that unlock testable functionality step by step. Each milestone ends with an explicit verification checkpoint before moving forward.

**Instruction:** Update this document immediately whenever a task or milestone is completed so progress is always marked in-place.

## Milestones

### Milestone 1 · Project Scaffolding & Tooling
- Goals: establish repo layout, shared configs, lint/test scaffolding, Docker baseline skeleton.
- Tasks:
  - [x] Introduce root workspace config (`package.json` + scripts) and shared TypeScript/eslint/prettier settings.
  - [x] Scaffold `server/` (Node/Express/TypeScript) and `client/` (React/Vite/TypeScript) folders with placeholder entry files.
  - [x] Provide initial Docker assets (`Dockerfile` stubs + base `docker-compose.yml`) to validate container workflows early.
  - [x] Add `.gitignore`, README updates (if needed), and ensure tooling scripts run without touching business logic yet.
- Verification: `npm install`, `npm run lint`, and `docker compose config` all succeed.

- Goals: minimal Express API that serves in-memory products and exposes health/status endpoints.
- Tasks:
  - [x] Implement REST routes for listing products, recording purchases (stub), and delivering kiosk config flags.
  - [x] Add unit tests (Vitest + supertest) covering route handlers and basic validation.
  - [ ] Integrate supertest smoke test pipeline via `npm run test:server`.
- Verification: `npm run test:server` passes; health endpoint reachable via Postman/curl.

### Milestone 3 · Database Integration & Persistence
- Goals: wire Express app to PostgreSQL with migrations and seed data.
- Tasks:
  1. Introduce ORM layer (Prisma or TypeORM) with schema for products, inventory, and transactions.
  2. Add migrations + seed script; connect to postgres service in Docker Compose.
  3. Extend tests to cover repository layer using test containers.
- Verification: `npm run db:migrate`, `npm run db:seed`, and integration tests pass inside Docker (`docker compose run api npm run test:server`).

### Milestone 4 · Frontend MVP
- Goals: kiosk UI that pulls product list, shows prices/images, and supports cart selection.
- Tasks:
  1. Build responsive product grid with cart interactions and mocked payment trigger.
  2. Fetch data from backend API (dev proxy) with robust loading/error states.
  3. Add Vitest/RTL smoke tests for key kiosk flows (`npm run test:client`).
- Verification: `npm run dev --workspace client` renders kiosk locally; `npm run test:client` passes.

### Milestone 5 · Admin Dashboard & Inventory Controls
- Goals: remote admin panel supporting inventory management and sales insights.
- Tasks:
  1. Implement authentication (e.g., simple password/token) and protected routes.
  2. Build inventory CRUD, disable kiosk toggle, and analytics charts (daily/weekly sales).
  3. Add end-to-end tests (Playwright/Cypress) for admin-critical paths.
- Verification: `npm run test:e2e` passes; manual review of analytics accuracy.

### Milestone 6 · Docker & CI Hardening
- Goals: finalize containerization and CI automation.
- Tasks:
  1. Complete Dockerfiles with production-ready builds for client/server.
  2. Optimize docker-compose for dev vs prod; add healthchecks.
  3. Introduce GitHub Actions workflow running lint, tests, and Docker build.
- Verification: `docker compose up` builds/runs full stack; GitHub Actions pipeline green.

### Milestone 7 · Payment & QR Flow (Deferred)
- Goals: integrate MobilePay QR workflow end-to-end once prerequisites and stakeholder familiarity are ready.
- Tasks:
  1. Generate QR payloads server-side; expose checkout endpoint.
  2. Render QR modal client-side; handle confirmation callbacks/webhooks in backend.
  3. Instrument logging/metrics around payments.
- Verification: end-to-end manual flow in staging; automated contract tests for QR payload generation.

## Running Checklist
- [x] Milestone 1 · Project Scaffolding & Tooling
- [ ] Milestone 2 · Backend API MVP
- [ ] Milestone 3 · Database Integration & Persistence
- [ ] Milestone 4 · Frontend MVP
- [ ] Milestone 5 · Admin Dashboard & Inventory Controls
- [ ] Milestone 6 · Docker & CI Hardening
- [ ] Milestone 7 · Payment & QR Flow (Deferred)

## Working Notes
- Current focus: Milestone 2 / Task 3 (wire `npm run test:server` into CI-ready workflow).
- Hold off on subsequent milestones until their verification steps are completed successfully.
