# Deployment Playbook

This guide captures the production workflow for the kiosk + admin platform, covering CI image builds, manual releases, rollback, and the ngrok smoke test.

## 1. Required Secrets and Variables

Configure these repository settings before running the pipeline:

- **Repository variables**
  - `CONTAINER_REGISTRY`: Container registry hostname (for example `ghcr.io`).
  - `CONTAINER_NAMESPACE`: Registry namespace or organization (for example `your-org`).
- **Repository secrets**
  - `REGISTRY_USERNAME`: Account or robot user allowed to push images.
  - `REGISTRY_PASSWORD`: Token/password for the registry user.

## 2. CI/CD Workflow Overview

The workflow in `.github/workflows/production-build.yml` performs the following:

1. Installs workspace dependencies with `npm ci`.
2. Runs Vitest suites for the server (with Testcontainers) and client.
3. Validates Prisma migrations via `prisma migrate diff` to catch schema drift.
4. Builds Docker images for `server` and `client` using Buildx.
5. Pushes tagged images (`<registry>/<namespace>/vibecode-*>:<sha>` plus `:latest`) when the run is a push directly to `main`.

Use **workflow_dispatch** for ad-hoc builds or tag promotions.

## 3. Manual Release Procedure

1. Ensure the workflow above succeeded on the commit you want to deploy.
2. Pull the tagged images locally or on your orchestration platform:
   ```bash
   docker pull <registry>/<namespace>/vibecode-api:<sha>
   docker pull <registry>/<namespace>/vibecode-web:<sha>
   ```
3. Update `docker-compose.production.yml` (or your deployment manifests) to reference the desired tags if not using `:latest`.
4. Apply database migrations (the API container does this on start unless `SKIP_PRISMA_MIGRATE=true`).
5. Bring the stack up:
   ```bash
   docker compose -f docker-compose.production.yml up -d
   ```
6. Monitor logs (`docker compose logs -f api web`) to confirm startup.

## 4. Rollback Strategy

1. Identify the last known good image tags from the registry or workflow run.
2. Update the deployment (compose file, Helm chart, etc.) to pin those tags.
3. Redeploy via `docker compose up -d` (or platform equivalent).
4. Restore the database from the most recent snapshot if the incident involved data corruption.

## 5. Ngrok Smoke Test (Pre-Production)

1. Build production images locally if needed:
   ```bash
   docker compose -f docker-compose.production.yml build
   ```
2. Start the stack:
   ```bash
   docker compose -f docker-compose.production.yml up -d
   ```
3. Run a tunnel for the web service:
   ```bash
   ngrok http http://localhost:8080
   ```
4. Exercise the admin login, management panels, and invite flow via the ngrok URL.
5. Tear everything down afterward (`docker compose down` and stop ngrok).

## 6. Operational Notes

- Production `.env` files set `AUTO_SEED=false`, so new admin accounts must be provisioned explicitly (use the invite API/UI).
- Remember to rotate `ADMIN_SESSION_SECRET`, `ADMIN_API_KEY`, and SMTP credentials when deploying to new environments.
- Enforce HTTPS termination and HSTS at the edge proxy or load balancer; the API already marks cookies as secure when `NODE_ENV=production`.
