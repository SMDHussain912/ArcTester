# ArcTester Dataset Factory

ArcTester includes a deterministic synthetic-data generator for developing and testing the intelligence pipeline.

## Dataset types

The factory currently generates five separate CSV datasets:

| File | Intended experiment | Target / label |
|---|---|---|
| `student-performance.csv` | Predict later formal score from practice history | Continuous formal score target |
| `topic-mastery.csv` | Estimate latent topic mastery from practice evidence | Noisy latent mastery target |
| `exam-readiness.csv` | Readiness from practice history | Binary readiness target (60% simulated threshold) |
| `learning-behaviour.csv` | Study consistency and engagement | Noisy engagement target |
| `score-prediction.csv` | Next-attempt score regression | Continuous next-attempt accuracy target |

All rows use generated `SYN_######` identifiers. They do not represent real ArcTester students.

## Generate datasets

From the repository root:

```bash
npm run dataset:generate --workspace=api
```

Generate a larger dataset with a fixed seed:

```bash
npm run dataset:generate --workspace=api -- --rows 10000 --seed 42
```

Choose a different output directory:

```bash
npm run dataset:generate --workspace=api -- --rows 5000 --seed 2026 --out ../datasets/synthetic
```

Default output is `datasets/synthetic/` with five CSV files and a `manifest.json`. The default is 1,000 rows per dataset and seed 42. The same seed and row count produce identical data.

## Important evaluation rules

1. Synthetic data is for pipeline development, algorithm tests, and controlled experiments.
2. Do not report synthetic validation metrics as evidence of real-world ECET prediction quality.
3. Do not combine synthetic and real student records in the same evaluation split.
4. Real data must be collected with appropriate permission, anonymized, and stored separately.
5. Features for a prediction must contain only information available before the outcome. The formal exam score is a label, never an input feature for exam readiness.
6. These distributions are simulated assumptions, not measured properties of ArcTester learners.

## Design

The generator uses seeded pseudo-random sampling and explicit constraints rather than asking an LLM to write raw CSV rows. This makes large datasets inexpensive, reproducible, testable, and easy to regenerate. AI can help propose scenarios and domain assumptions, but those assumptions must be reviewed and validated before being treated as meaningful training data.

## Quality reports and target separation

The generated `manifest.json` includes each dataset's task type, identifier column, explicit feature columns, target column, and a quality report. Reports include row count, duplicate IDs, missing values, invalid feature rows, numeric feature ranges/means, target distribution, and warnings. The analyzer rejects definitions that put the target column into the feature list.

Target columns are prefixed with `target_` and are not part of the feature lists. Do not train by blindly passing every CSV column into a model: use the manifest's `featureColumns` and `targetColumn` definitions. Synthetic targets include noise/latent outcomes to avoid simple exact-rule labels wherever possible; they still represent simulated assumptions, not measured learner behaviour.

## Train and compare models

Run the end-to-end experiment pipeline from the repository root:

```bash
npm run dataset:experiment --workspace=api
```

Choose the synthetic row count, random seed, and output folder:

```bash
npm run dataset:experiment --workspace=api -- --rows 5000 --seed 42 --out ../datasets/experiments
```

The runner prepares all five datasets, makes a deterministic row-level holdout split, fits categorical vocabularies on training rows only, trains the existing algorithms, and writes:

- `report.json` — dataset split sizes, feature metadata, and held-out metrics.
- `models/` — JSON model artifacts with the dataset name, feature names, target name, task type, and trained model.

Binary classification experiments compare Logistic Regression, KNN, Decision Tree, and Gaussian Naive Bayes. Each classifier now gets stratified cross-validation and a small deterministic hyperparameter search (logistic iterations/rate, KNN k, tree depth, and Naive Bayes variance smoothing). The selected configuration is retrained on the full training partition and evaluated once against the untouched holdout. The report stores tuning parameters, cross-validation metrics, and held-out metrics separately. Regression experiments use Multiple Linear Regression. Categorical columns are one-hot encoded; categories absent from training are mapped to an explicit unknown bucket. Student identifiers and target columns are never model features.

This initial holdout split is appropriate for checking the synthetic pipeline. Cross-validation and hyperparameter selection use only the training partition; the final holdout is not used for tuning. It is not a substitute for grouped-by-student or chronological evaluation on real learner histories. Do not interpret model rankings or metrics from generated data as real ECET prediction performance.


## Model registry and inference

The experiment runner also writes versioned model packages to:

`models/registry/<model-id>/versions/<version>.json`

Each package contains the validated model artifact, task/algorithm metadata, dataset and target names, and the fitted preprocessing schema. The schema records numeric columns and categorical vocabularies, including the reserved unknown-category bucket. Model packages contain no student identifiers or raw training rows except where an algorithm intrinsically requires its training vectors (KNN).

The registry maintains an `active.json` pointer per model. The first registered version becomes active automatically. Later experiment runs create a new version but **do not promote it automatically**; this prevents an unreviewed experiment from silently replacing the active model. Promotion and rollback are explicit operations.

Example use from API code:

```ts
import { ModelRegistry } from "./modelRegistry.js";

const registry = new ModelRegistry(process.env.ARCTESTER_MODEL_REGISTRY_DIR ?? "./model-registry");

// List versions and explicitly promote a reviewed version.
const versions = await registry.list("exam-readiness-logistic-regression");
await registry.activate("exam-readiness-logistic-regression", versions.at(-1)!.version);

// Inference loads the active artifact and reuses its saved feature encoding.
const featureValues: Record<string, number | string> = obtainValidatedFeatureValues();
const result = await registry.predict("exam-readiness-logistic-regression", featureValues);
```

The registry validates model artifacts on save and load, checks model/preprocessing feature counts, rejects unsafe model IDs, writes JSON through temporary files followed by atomic rename, caches loaded active versions, and supports explicit rollback. Predictions reject missing, extra, or incorrectly typed features. Unknown categorical values use the training-time unknown bucket.

**Storage limitation:** this version uses a filesystem-backed registry. Point it at a persistent mounted directory before using it in a deployed service; ephemeral container filesystems can lose model versions during redeploy/restart. It is not yet wired to a student-facing prediction endpoint. Synthetic models remain for pipeline verification only and must not be promoted as real ECET learner models.


### Durable API registry (admin)

The API now stores reviewed model versions in the SQLite `RegisteredModel` table instead of relying on the experiment runner's local filesystem registry. The database migration creates a unique `(modelId, version)` key and an active-version index. This storage survives service restarts and redeploys when the deployed database volume is persistent and backed up.

Admin-only endpoints (session cookie or bearer token):
- `GET /admin/models` — list registered versions and active status.
- `POST /admin/models` — register a validated artifact. The first version becomes active; later versions remain inactive.
- `POST /admin/models/:modelId/:version/activate` — explicitly promote a version.
- `POST /admin/models/:modelId/rollback` — activate the nearest earlier version.
- `POST /admin/models/:modelId/predict` — run inference against the active validated artifact using `{ "features": { ... } }`.

Model registration and promotion revalidate the artifact and its preprocessing schema. The API does not expose filesystem paths or raw artifact JSON in list responses. These endpoints are administrator-only while the model lifecycle is being validated; no student-facing readiness predictions are enabled. A real learner model still requires appropriately consented, de-identified training data and chronological/grouped evaluation.


## Model governance and audit history

The database-backed admin model registry records governance events in
`ModelRegistryAudit`. Registration, first-version activation, manual activation,
and rollback are written in the same database transaction as the model change,
so an audit event cannot claim an activation that failed to commit.

Admin endpoint:

- `GET /admin/models/:modelId/audit` — returns the latest 200 governance events,
  including actor ID, version, action, details, and timestamp.

SQLite also enforces a partial unique index allowing at most one active version
per model ID. This protects the invariant even if a future route or maintenance
script bypasses the application-level transaction. Audit history is append-only
through the current API; there is no API for editing or deleting events.

This is governance traceability, not model-quality approval. Candidate evaluation
and evidence-based promotion gates are still separate work; the current activation
endpoint does not yet establish that a model is accurate or suitable for real
student-facing predictions.


## Candidate evaluation and promotion gates

The admin Model Lab registers immutable evaluation dataset versions before
using them to compare model versions.

Admin endpoints:

- `POST /admin/model-datasets` — register a holdout dataset with its name,
  task, feature schema, 10–5,000 samples, source description, and explicit
  source attestation. The API validates every row and stores the payload,
  creator, timestamp, and SHA-256 content fingerprint.
- `GET /admin/model-datasets` — list registered dataset versions and their
  metadata without returning the stored sample payload.
- `POST /admin/models/:modelId/:version/evaluate` — evaluate a candidate
  against a baseline using a registered `datasetId`; arbitrary sample arrays
  are no longer accepted by this evaluation endpoint.
- `GET /admin/models/:modelId/audit` includes the resulting `EVALUATED` event.

Identical dataset payloads (including name, task, feature schema and samples)
cannot be registered twice. Registered sample content is immutable through
the current API. Dataset metadata and fingerprints are visible in Model Lab.

Acceptance rules are deliberately conservative and explicit:

- Binary classification: candidate F1 **and** accuracy must be no worse than
  the baseline.
- Regression: candidate MAE **and** RMSE must both be no worse than baseline.

The API computes both metric sets server-side against the same stored samples,
stores an immutable evaluation report linked by dataset ID, and records the
dataset fingerprint. A candidate version above version 1 cannot be manually
activated unless its latest evaluation report has status `PASSED`. Rollback
only selects an earlier version that was activated before, so it cannot
accidentally promote an unreviewed failed candidate.

**Evidence limitation:** source descriptions and attestation are administrator
declarations, not independent proof of dataset provenance. The fingerprint
detects content changes and duplicate payloads; it does not prove the original
data was genuine, prevent an administrator from registering fabricated data,
or establish real-world model quality. Synthetic data is not production
validation. A future trusted ingestion workflow must verify provenance and
separate training, validation, and final holdout splits before production use.


## Training from registered datasets

The admin Model Lab can train candidates directly from a registered dataset:

- `POST /admin/model-datasets/:datasetId/train`
- Body: `{ "modelId": "ecet-readiness", "seed": 42 }`
- The dataset's stored task, target column, and feature schema are used; the request
  cannot override them.
- Training requires 30–5,000 rows. Binary classification requires at least 10
  examples of each class and runs stratified five-fold hyperparameter tuning
  on the training partition.
- The pipeline creates a deterministic 80/20 holdout split. Preprocessing
  categories are taken from the registered schema, and held-out metrics are
  reported separately from cross-validation metrics.
- Classification trains logistic regression, KNN, decision tree, and Gaussian
  Naive Bayes. Regression trains multiple linear regression.
- Each candidate artifact is validated and stored in the database registry.
  Candidates are always created inactive; training never promotes a model.
- The training event records the dataset ID and fingerprint, split sizes,
  metrics, tuning parameters, and random seed in the model audit history.

Candidates must still pass the separate registered-dataset baseline evaluation
before activation. Training and evaluation on synthetic data are pipeline
checks only, not evidence that a model is suitable for real student decisions.


### Candidate ranking

Each training response includes a deterministic rank for candidates trained on
the same dataset and held-out split:

- Binary classification: F1 descending, then accuracy, precision, and recall.
- Regression: RMSE ascending, then MAE.
- Exact metric ties are broken by algorithm name for stable ordering.

The Model Lab shows this as an experiment leaderboard. Rank 1 is not an automatic
promotion: the candidate must still be evaluated against a separately registered
baseline dataset and pass the model governance gate.
