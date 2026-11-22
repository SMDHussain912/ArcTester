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

- Exact-head GitHub Actions: **PENDING** — verify the full CI and Android artifact workflows on this PR head before merge.
- APK install and startup on a physical Android device: **NOT VERIFIED**.
- Accessibility with TalkBack/screen reader, keyboard/focus traversal, and contrast review on the actual student flows: **NOT VERIFIED**.
- Low-end physical device cold start, memory, sustained frame rate and real mobile network: **NOT VERIFIED**.
- Hosted smoke: **NOT VERIFIED** until the repository variables are configured and the hosted workflow passes against the current deployment.

## Manual acceptance

1. Download the APK artifact from the successful Android Build workflow and verify the included SHA-256 file.
2. Install the APK on a physical Android device; launch, sign in, open a lesson/practice flow, and confirm no crash.
3. Test reduced motion and keyboard/focus on web; test TalkBack and touch target behavior on Android.
4. Run the hosted smoke workflow after setting `ARCTESTER_WEB_URL` and `ARCTESTER_API_URL` repository variables.
5. Record device model, Android version, APK SHA, cold-start observation and any blockers before marking Phase 9 complete.

Phase 9 is not complete until exact-head CI passes, the PR is merged, the hosted checks are run against the deployment, and the physical-device manual checks are reported honestly.
