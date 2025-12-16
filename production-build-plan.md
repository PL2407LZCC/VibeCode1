# Production Dockerization Plan

## Objective
- Transition the kiosk + admin stack from dev-only Docker images/compose setup to production-grade builds with reproducible images, minimized attack surface, and hardened configuration.
- Provide a repeatable checklist for building, testing, and packaging the server and client artifacts, then exposing them via ngrok for a quick smoke test before broader deployment.

## Phase 1 — Readiness & Inventory
- [x] Audit environment variables; document which values must differ in production (session secrets, JWT signing keys, database URL, SMTP credentials, admin seed account details).
- [x] Create `.env.production` files for both server and client images (prefer secrets manager for real deployment).
- [x] Verify Prisma migrations are up to date and captured in source control.
- [x] Confirm unit/integration test coverage is green (`npm run test` in `server` and `client`).

## Phase 2 — Server Image Hardening
- [x] Convert `server/Dockerfile` into a multi-stage build:
  - Stage 1: use `node:20-alpine` (or LTS) builder, run `npm ci`, `npm run build`, and `npm prune --production`.
  - Stage 2: minimal runtime (e.g., `node:20-alpine` or `gcr.io/distroless/nodejs`), copy `dist/`, `node_modules/`, Prisma schema, migrations, and `package.json`.
- [x] Run `prisma generate` during build so the client is vendored.
- [x] Add non-root user in runtime stage (`USER node`) and create writable `uploads` directory owned by that user.
- [x] Replace `CMD npm run dev` with an entrypoint shell script that applies migrations (`npx prisma migrate deploy`) then executes `npm run start`.
- [x] Ensure healthcheck endpoint exists (e.g., `GET /healthz`) and expose it for container orchestration.

## Phase 3 — Client Image Hardening
- [x] Convert `client/Dockerfile` into multi-stage production image:
  - Stage 1: `node:20-alpine` builder, run `npm ci` and `npm run build`.
  - Stage 2: lightweight static server (e.g., `nginx:alpine`, `caddy`, or `node:20-alpine` + `npm install --global serve`).
  - Copy `dist/` assets into runtime image and configure web server to serve SPA (rewrite to `/index.html`).
- [x] Inject production env vars at build time via `VITE_*` replacements or runtime config file.
- [x] Add headers/security config in chosen static server (cache control, gzip/brotli if available).

## Phase 4 — Compose & Deployment Topology
- [x] Create `docker-compose.production.yml` (or `stack.yml`) that uses the hardened images without bind mounts.
- [x] Point to pre-built images (`image:`) instead of local `build:` contexts for CI/CD pipelines.
- [x] Remove dev-only ports; expose only required services (e.g., API 3000, web 8080).
- [x] Use `depends_on` with healthcheck conditions and add explicit `restart: unless-stopped`.
- [x] Externalize secrets via `env_file` and avoid embedding them inside the compose file.
- [x] Define persistent volumes for uploads and database snapshots, but avoid host bind mounts that leak source code.
- [x] Configure logging driver (json-file with rotation) or forward to centralized logging.

## Phase 5 — Observability & Security
- [x] Enable structured logging and ensure logs go to stdout/stderr.
- [x] Add request metrics or integrate with APM if required.
- [x] Review CORS configuration; tighten allowed origins to production domain.
- [ ] Turn on HTTPS termination at load balancer/reverse proxy; ensure HSTS and secure cookies when behind TLS.
- [x] Rotate default admin credentials; disable automatic seeding after first run or guard behind feature flag.

## Phase 6 — Build & Release Pipeline
- [x] Implement CI job that runs tests, builds images, and pushes to registry (tag with commit SHA + `latest`).
- [x] Add release instructions (e.g., `docker buildx bake`, `docker compose -f docker-compose.production.yml up -d`).
- [x] Document rollback procedure (redeploy previous tag, restore DB snapshot).
- [x] Monitor migrations in pipeline; fail build if schema drift detected.

## Phase 7 — Ngrok Smoke Test (Pre-Production)
- [ ] Build local production images: `docker compose -f docker-compose.production.yml build`.
- [ ] Start stack locally in detached mode: `docker compose -f docker-compose.production.yml up -d`.
- [ ] Run database migrations inside API container if not wired into entrypoint.
- [ ] Launch ngrok tunnel pointing at the public web port (e.g., `ngrok http http://localhost:8080`).
- [ ] Conduct a basic admin login, dashboard navigation, and invite flow using ngrok URL; monitor container logs for errors.
- [ ] Tear down tunnel and containers after validation.

## Acceptance Criteria
- Production Docker images run without development dependencies, watchers, or bind mounts.
- Startup sequence reliably migrates the database and serves built assets.
- Sensitive configuration is injected securely and not baked into source images.
- Ngrok smoke test confirms the production images function end-to-end prior to real deployment.
