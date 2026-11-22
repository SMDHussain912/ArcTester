# Phase 9 — Release Verification

## Scope

Phase 9 brings the release-verification path together:

- Android CI builds a standalone release APK and uploads the APK with a SHA-256 checksum and build metadata.
- A scheduled and manually dispatchable hosted smoke workflow checks the deployed HTTPS web shell and API liveness endpoint.
- Playwright release checks cover basic accessible names/landmarks, image alt declarations, a 320px no-horizontal-overflow check, and a throttled low-end web-load check.
- Physical Android accessibility, install/startup and low-end device measurements remain explicit manual acceptance items.

## Implementation

- Android workflow: `.github/workflows/android-build.yml`
- Hosted smoke workflow: `.github/workflows/hosted-smoke.yml`
- Smoke script: `scripts/hosted-smoke.sh`
- Automated accessibility/performance checks: `web/tests/e2e/phase-9-release-checks.spec.ts`

The hosted smoke workflow requires repository Actions variables `ARCTESTER_WEB_URL` and `ARCTESTER_API_URL`, both HTTPS origins. It runs daily at 03:17 UTC and on manual dispatch. The API check uses `GET /health` (liveness only); it does not claim database readiness or authenticated user-flow coverage.

## Verification

- PR #175 merged on 2026-11-22 (merge commit `c45c2c21b85f82054fe728197eb1fa4fb7288383`).
- Exact-head GitHub Actions run #44967911502 passed all five jobs on commit `3bd15ab2a03101bb28fcb196b84a2f03186d4d16`.
- Android build #44967911493 passed and produced the APK; SHA-256: `21013f6276a117beff4588c9140dbb9832cecec62c790a710ce4fada4a79dd2d`.
- Hosted smoke run #45017484276 failed because `ARCTESTER_WEB_URL` was not configured. This is not a successful deployment-health check; configure both URL variables and rerun.
- APK install/startup on a physical Android device: **NOT VERIFIED**.
- TalkBack/screen-reader, keyboard/focus traversal, and contrast review on real student flows: **NOT VERIFIED**.
- Low-end physical device cold start, memory, sustained frame rate, and real mobile network: **NOT VERIFIED**.

## Manual acceptance

1. Configure `ARCTESTER_WEB_URL` and `ARCTESTER_API_URL` repository variables and run hosted smoke against the current deployment.
2. Install the verified APK on a physical Android device; launch, sign in, open a lesson/practice flow, and confirm no crash.
3. Test reduced motion and keyboard/focus on web; test TalkBack and touch target behavior on Android.
4. Record device model, Android version, APK SHA, cold-start observation, and any blockers before marking Phase 9 complete.

Phase 9 implementation is merged. Phase acceptance remains incomplete until hosted smoke passes and physical-device accessibility/performance checks are recorded honestly.
