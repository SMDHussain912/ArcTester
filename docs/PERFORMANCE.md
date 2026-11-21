# ArcTester — Performance Baseline & Measurements

## Measurement methodology

All measurements are taken from a production Vite build (`npm run build` in `web/`) against the current working tree, with no device-specific or network-specific qualification. Real-device frame rates, cold starts on hardware, and low-end hardware behavior are **NOT VERIFIED** unless explicitly noted.

## Web baseline (Vite production build)

Measured on branch `kilo/polish-1`, commit after PR #20 merge, before polish changes.

| Asset | Size | Gzip | Notes |
|---|---|---|---|
| `dist/assets/index-*.js` | 290.08 kB | 83.96 kB | Single chunk, all student + admin code bundled together |
| `dist/assets/index-*.css` | 42.51 kB | 8.30 kB | All styles |
| `dist/index.html` | 0.73 kB | 0.39 kB | Shell |
| Modules transformed | 84 | — | Vite module count |

### Budgets (PR2)

| Metric | Budget | Status |
|---|---|---|
| Initial student JS (gzip) | <= 110 kB | NOT MET — current single chunk is 83.96 kB gzip but includes admin code that students must not download; code-splitting is required to isolate student code |
| LCP | < 2.5 s | NOT MEASURED — Lighthouse CI not yet added |
| CLS | < 0.1 | NOT MEASURED — Lighthouse CI not yet added |
| Performance score (mobile throttled) | >= 85 | NOT MEASURED — Lighthouse CI not yet added |

### Baseline caveats

- The single JS chunk bundles admin code (AdminWorkspace, AdminModelLab, analytics, Excel import/xlsx) together with student code, so students download code they cannot use. Code-splitting (React.lazy + manualChunks) is the targeted fix in PR2.
- No service-worker precache size is recorded yet; the installable shell exists (`web/public/sw.js`, `manifest.json`) but its runtime cache footprint is unmeasured.
- No Lighthouse CI report exists yet.

## How to re-measure

```bash
# Web bundle
cd web
npm run build
# Read dist/assets/* sizes from the build output

# Lighthouse CI (once added in PR2)
npm run ci:lighthouse   # planned

# API p50/p95 (once PR3 perf-seed + measurement added)
# See scripts/perf-seed.ts and docs/PERFORMANCE.md API section
```

## Mobile baseline

NOT MEASURED — no release APK build or bundle/APK size measurement has been performed. Real-device cold-start time is NOT VERIFIED.

## Android baseline

NOT MEASURED — physical low-end Android startup, memory use and frame rate have not been captured in this document. Treat real-device performance as **NOT VERIFIED** until Phase 9 device checks are completed.
