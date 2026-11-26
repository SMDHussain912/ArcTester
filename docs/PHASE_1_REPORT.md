# Phase 1 Report — Repository Cleanup

**Status: DONE** — PR [#143](https://github.com/smdgamekingindo-TN/ArcTester/pull/143) merged to `main` on 2026-11-21.

## Verification

- PR head: `27efd9da752a9b9d070a67eebd12393350bbd49b`
- Merge commit: `d9237c01ad86237b67e64620087453c9ebfc3a39`
- Exact-head GitHub Actions: [ArcTester CI](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/44923422157) and [Android Build](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/44923422153) passed.

## Measured change

| Metric | Before Phase 1 | After Phase 1 | Change |
|---|---:|---:|---:|
| Web JS (Vite reported) | 381.94 kB | 290.42 kB | -91.52 kB |
| Web CSS (Vite reported) | 102.39 kB | 88.66 kB | -13.73 kB |
| Web assets total (JS + CSS + HTML) | 486.53 kB | 381.28 kB | -105.25 kB |
| Web assets gzip total (reported) | 126.46 kB | 99.69 kB | -26.77 kB |
| Deleted source files | — | 111 | 111 removed |
| Lines in deleted source files | — | 19,719 | 19,719 removed |

Web figures are summed from the Vite production-build output in the before/after CI logs; they are build-reported asset sizes, not a separately measured filesystem `du` result.

## API dependency install size

**NOT MEASURED.** The before/after CI logs record npm package counts and npm cache size, but not the installed `api/node_modules` directory size. Cache size is not an acceptable substitute for installed disk size. A reproducible install followed by `du -sb api/node_modules` is still required to fill this metric.

## Manual / production verification still required

- Back up production before applying the Phase 1 PostgreSQL migration.
- Deploy the API and verify the migration against production data.
- Administrator relinks legacy study-material URLs and reviews/publishes them.
- Install the APK and smoke-test on a physical Android device, including low-end performance.

No production migration, hosted setting, or physical-device result is claimed verified by CI.
