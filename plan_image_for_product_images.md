# Implementation Plan: Admin Image Upload Workflow

## Goal
Allow administrators to upload product photos directly through the admin UI, with the server storing the files and linking the resulting URL to the product record. This replaces the current requirement to pre-place image assets in the client bundle.

## Constraints & Assumptions
- Backend remains Node/Express with Prisma/PostgreSQL.
- Accept reasonably small images (e.g. <= 5 MB) and common formats (JPEG/PNG/WebP).
- No external storage service. Files will reside on the API container/host (for production we can later swap to object storage).
- Admin API is already authenticated via header token.
- Dockerized development environment must continue to work without extra setup.

## Milestones

### Milestone 1 · Backend Upload Endpoint
- Add file upload middleware (e.g. `multer`) with disk storage to a configurable directory (`UPLOADS_DIR`, default `/usr/src/app/uploads`).
- Create POST `/admin/uploads` endpoint that:
  - Requires admin token (reuse `requireAdmin`).
  - Accepts a single file field (e.g. `image`).
  - Validates MIME type & size.
  - Generates unique filename (timestamp + random hash + original extension).
  - Persists file to uploads directory.
  - Returns JSON payload with public URL (e.g. `/uploads/<filename>`).
- Ensure uploads directory is created at startup and excluded from source control.
- Update `docker-compose.yml` to volume-map uploads path for persistence in dev.

### Milestone 2 · Static File Serving
- Configure Express to serve files under `/uploads` statically (read-only).
- In production Docker image, ensure uploads directory exists and is writable.
- Document environment variable & volume requirements.

### Milestone 3 · Admin Dashboard Integration
- Extend `useAdminDashboard` hook with `uploadImage(file: File)` helper calling `/admin/uploads`.
- Update create product form to allow selecting a file:
  - On file selection, call `uploadImage`, set returned URL into form state, and provide upload progress/feedback.
- Update edit product flow similarly (already partially present) to use new upload helper instead of stubs.
- Handle error states (size/type rejection, network issues).

### Milestone 4 · Validation & Tests
- Add backend unit/integration tests covering:
  - Successful upload.
  - Disallowed file types or oversized payloads.
  - Auth failure.
- Add frontend tests (Vitest or Playwright) covering:
  - Upload success path.
  - Upload error message display.
- Verify lint/build/test pipelines remain green.

### Milestone 5 · Documentation & Ops
- Update README/admin instructions to cover upload workflow and disk storage implications.
- Mention ENV knobs: `UPLOADS_DIR`, allowed mime types/size, optional CDN integration.
- Add note about production deployment needing persistent storage or external bucket.

## Risks & Mitigations
- **Storage growth**: Add TODO for cleanup/archival strategy. Consider pruning unused files periodically.
- **Security**: Restrict uploads to images, sanitize filenames, and disallow overwriting existing files.
- **Scalability**: Plan future enhancement to switch to S3/GCS when moving beyond single server.

## Definition of Done
- Admin can upload an image from UI; product is saved with new image URL immediately.
- Upload survives container restarts in dev (thanks to volume).
- Tests cover happy path and failure modes.
- Documentation updated.
