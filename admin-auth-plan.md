# Admin Authentication & Password Reset Plan

## Overview
- Introduce secure username/password authentication for admin access.
- Provide email-based password reset flow with expiring, single-use tokens.
- Preserve existing token gating during transition; migrate to credential-based login once ready.

## Assumptions
- SMTP provider credentials are or will be available (environment variables).
- Admin users are relatively few; no multi-tenant separation required.
- Current admin dashboard is served from the client app and can accommodate login UI.

## Milestones

### 1. Database & Prisma Updates
- [x] Add `AdminUser` model (id, email, username, passwordHash, passwordSalt/algorithm metadata, createdAt, updatedAt, lastLoginAt, resetToken fields as needed).
- [x] Create migration adding unique indexes on email and username.
- [x] Update Prisma client generation and regenerate types.

### 2. Password Hashing Infrastructure
- [x] Choose hashing algorithm (e.g. Argon2id via `argon2` library or `bcrypt`); add dependency.
- [x] Implement utility helpers for hashing and verifying passwords.
- [x] Store algorithm metadata to support future migrations.

### 3. Admin User Repository & Services
- [x] Add repository wrapper for admin users (create, update, find by email/username, persist reset tokens, record login).
- [x] Implement authentication service handling credential verification, lockout/failure counting (if desired), and reset token issuance/validation.

### 4. API Layer Changes
- [x] Introduce `/auth/login` endpoint accepting username/email + password, returning session token/JWT.
- [x] Replace simple header token check in middleware with session validation (e.g. JWT + HMAC secret, or signed httpOnly cookie session).
- [x] Add `/auth/logout` if using server-side sessions.
- [x] Add `/auth/password-reset/request` to queue reset email and `/auth/password-reset/confirm` to set new password.
- [x] Update `/admin` routes to require new auth middleware.
- [x] Provide transitional compatibility (allow old token for limited period) if necessary.

### 5. Email Delivery Pipeline
- [x] Integrate mail provider (e.g. SMTP via `nodemailer`).
- [x] Create templated password reset email with secure link containing token.
- [x] Ensure reset links expire (e.g. 30 minutes) and are single-use.
- [x] Configure environment variables for SMTP host, port, credentials, from address.

### 6. Frontend Updates
- [x] Create admin login page with form validation and error handling.
- [x] Update admin dashboard shell to require authentication (redirect/guard if unauthenticated).
- [x] Add password reset request form and reset confirmation form (new password + confirmation).
- [x] Handle tokenized reset link (e.g. `/admin/reset?token=...`).
- [x] Store session token securely (prefer httpOnly cookie; otherwise, use secure storage and attach to requests).
- [x] Replace usages of `VITE_ADMIN_TOKEN` with authenticated session handling; ensure API hook adds auth headers automatically.

### 7. Security & Compliance Considerations
- [ ] Enforce strong password policy (min length, complexity or passphrase guidance).
- [ ] Rate-limit login and reset endpoints; add basic brute-force protection (e.g. exponential backoff or IP limiting).
- [ ] Add CSRF protection if using cookies (same-site, anti-CSRF token).
- [ ] Ensure all reset tokens are randomly generated (>=32 bytes) and hashed at rest.
- [ ] Audit logging: log successful/failed logins, reset requests, password changes.
- [ ] Revoke active sessions when password changes.

### 8. DevOps & Configuration
- [x] Add new environment variables to `.env.example`, Docker compose, and deployment manifests.
- [x] Update seed script to create initial admin user with strong random password printed once.
- [ ] Update CI to run Prisma migrate for new schema.

### 9. Testing Strategy
- [ ] Unit tests for hashing helpers and authentication service logic.
- [ ] Integration tests covering login success/failure, reset request, reset completion, and new middleware gating.
- [ ] End-to-end test scenario for admin login + dashboard access + password reset flow (Playwright).
- [ ] Manual QA checklist for email delivery, token expiry, invalid/used token handling.

### 10. Rollout Plan
- [ ] Deploy backend changes with feature flag allowing both token and credential auth.
- [ ] Prompt existing admins to set passwords (email invite or manual process).
- [ ] After confirmation, remove legacy static token and clean up related code.

## Risks & Mitigations
- **Email deliverability issues**: configure SPF/DKIM; provide fallback manual reset path.
- **Password reset abuse**: throttle requests per email/IP; generic response to avoid user enumeration.
- **Session fixation**: issue new token after login and password reset.
- **Hash algorithm updates**: store version field to support rehashing on next login.

## Open Questions
- Will admins self-register or only seeded by operators? (Assumed operator-managed.)
- Preferred session strategy: JWT vs. server sessions? (Needs alignment with deployment constraints.)
- Need multi-factor auth now or later? (Out of scope unless requested.)
