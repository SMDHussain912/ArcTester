# Security review checklist

**Status: checklist prepared; production security verification is NOT VERIFIED.**
This document records code-observed controls and the checks that must be completed
before a production security sign-off. It is not a penetration-test report.

## Controls observed in the repository

- Authentication uses HMAC-SHA256 JWTs and Node.js `scrypt` password hashing.
  Production startup rejects a missing, short, placeholder or development JWT secret.
- Student registration requires a single-use, expiring invitation. Privileged
  middleware reads the current user role from the database.
- Browser sessions use an `HttpOnly` cookie with a seven-day max age. Production
  cookies are `Secure`; `SameSite=Lax` is the default, with `SameSite=None`
  available for explicitly configured cross-site hosting.
- CORS reflects only an exact configured origin or a localhost/loopback origin,
  sets `Vary: Origin`, and enables credentials for approved origins.
- Production cookie-authenticated state-changing requests pass through the
  trusted-origin CSRF guard.
- Login and bearer-token sign-in share a best-effort in-memory throttle:
  eight failed attempts per email in a 15-minute window. This is process-local,
  not a distributed rate limiter.
- Express JSON request bodies are limited to 10 MB.

These observations describe source code, not the deployed environment.

## Review checklist

### Authentication and authorization

- [ ] Confirm every production service has a unique, randomly generated
      `JWT_SECRET` of at least 32 bytes; confirm no development fallback is set.
- [ ] Verify JWT signature, expiry, subject, session-version and current database
      role checks across browser and bearer-token requests.
- [ ] Verify logout increments the session version and revokes existing browser
      and bearer sessions across all running API instances.
- [ ] Verify invitation creation, expiry, single-use claiming and revocation.
- [ ] Review password policy, scrypt parameters, password reset/recovery and
      administrator bootstrap procedures.
- [ ] Confirm authorization is enforced server-side for every admin and
      invigilator route; never rely on hidden UI controls.

### CORS and CSRF

- [ ] Set `CORS_ORIGINS` to exact production origins only; do not use wildcards.
- [ ] Decide whether localhost/loopback origins should remain allowed in
      production and test that policy explicitly.
- [ ] Verify preflight handling, allowed methods/headers, credentials and
      `Vary: Origin` in every deployed environment.
- [ ] Test the production CSRF guard against missing, null, untrusted and
      cross-site Origin headers for cookie-authenticated mutations.
- [ ] Confirm native clients use bearer tokens and do not depend on browser CORS.

### Cookies and browser sessions

- [ ] Verify production cookies include `HttpOnly`, `Secure`, `Path=/`,
      the intended `SameSite` value and the expected max age.
- [ ] Verify the frontend/API domain arrangement and third-party-cookie behavior
      in supported browsers; prefer same-site custom domains where possible.
- [ ] Test login, refresh, logout, session revocation and protected requests on
      desktop and mobile browsers.
- [ ] Confirm no access token or session cookie is written to browser
      localStorage/sessionStorage or exposed to client-side logs.

### Rate limits and abuse controls

- [ ] Verify the current login throttle's behavior, reset window and 429 response.
- [ ] Replace or supplement the process-local throttle with a shared,
      production-safe limiter when running multiple API replicas.
- [ ] Review rate limits for invitation creation, registration, password/token
      sign-in, question imports, exam creation/submission and expensive model
      operations.
- [ ] Define account/IP abuse controls that avoid allowing one source to
      permanently lock out another user's account.
- [ ] Review request-size limits, pagination caps, upload limits and timeouts.

### Dependency and supply-chain audit

- [ ] Run `npm audit` against the committed lockfile and review production and
      development dependency advisories separately.
- [ ] Triage each high/critical advisory; document accepted risk or upgrade plan.
- [ ] Review direct and transitive dependency changes in pull requests.
- [ ] Enable and review Dependabot/security advisories for the repository.
- [ ] Confirm CI uses pinned or trusted actions and review action updates.

Suggested audit commands from the repository root:

```bash
npm audit
npm audit --omit=dev
npm audit --json > npm-audit-report.json
```

Do not commit audit output if it contains private registry or environment details.

## NOT VERIFIED

- No production secrets, hosting environment variables or provider settings were
  inspected or validated by this checklist.
- No production browser-cookie/CORS/CSRF test or physical-device test was run.
- No distributed rate-limit behavior was exercised; the observed login throttle
  is process-local.
- No `npm audit` or independent dependency review was run as part of this PR.
- No penetration test, external security assessment or incident-response drill
  was performed.

Record evidence, date, reviewer and remediation PR for each checked item before
calling the production security review complete.
