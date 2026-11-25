# ArcTester Admin MCP — Model Control Plan

**Status:** Model-control MCP slice under implementation  
**Owner surface:** Administrator MCP at `/mcp/admin`  
**Principle:** The MCP is a model control plane. It must not claim to train or run inference unless a real worker/runtime has done so.

## Current implementation in this branch

- Expose existing PostgreSQL model tables through Prisma: `ModelDataset`, `ModelTrainingJob`, `RegisteredModel`, `ModelEvaluation`, `ModelRegistryAudit`, and `ModelDriftBucket`.
- Add independent least-privilege Admin MCP scopes for model read, dataset creation, verification-data read, training queue, model registration, evaluation, and activation.
- Create bounded, schema-checked, fingerprinted datasets with explicit provenance and dataset kind.
- Prevent verification datasets from being used as training inputs.
- Queue asynchronous training jobs and expose honest job/worker state.
- Return only paginated rows from attested verification datasets.
- Register candidate artifacts by URI and SHA-256; registration never activates a candidate.
- Record candidate-vs-baseline evaluation on an attested verification dataset.
- Activate one model version per `modelId` only after a passing evaluation and explicit confirmation.
- Audit registration, evaluation, and activation. Artifact metadata is allowlisted; secrets and model binaries are never returned.

## Delivery phases

### Phase 1 — Admin MCP control plane (this branch)
Acceptance:
- Prisma schema matches existing PostgreSQL migrations and generated client.
- Dataset validation enforces exact columns, feature types, target type, size/row limits, and deterministic fingerprint.
- Model training jobs are queued with bounded settings and visible status.
- Model candidates can be registered, evaluated, and activated only through scoped tools and audit entries.
- CI tests, lint, build, migration checks and E2E pass.

### Phase 2 — Real training worker
- Add a separate worker process/service; do not train inside the web API request.
- Start with supported scikit-learn algorithms (classification/regression) and explicit train/validation split.
- Claim jobs with leases, heartbeat, bounded CPU/memory/time, cancellation and retry policy.
- Train only on `training` or `synthetic` datasets; never on `verification` rows.
- Save model artifact to private object storage; store URI, SHA-256, framework, feature schema and metrics in job result.
- Mark job completed only after artifact checksum and output schema are verified.
- Add worker tests for invalid data, expired leases, failed training, retries and reproducible seeds.

### Phase 3 — Verification and model assignment
- Add an evaluator worker that consumes verification datasets without training on them.
- Compute task-specific metrics from predictions, not from manually supplied claims.
- Record a signed/traceable evaluation result with dataset fingerprint, sample count, baseline version and candidate version.
- Add feature-to-model assignments (e.g. `readiness_classifier`, `question_difficulty`, `recommendation_ranker`) with versioned configuration.
- Make each feature explicitly load its assigned registered model; keep deterministic/rule-based fallback.
- Add shadow mode, inference telemetry, rollback and stale-model handling before student-facing rollout.

### Phase 4 — Dataset governance and quality
- Add dataset catalog, preview, lineage, duplicate checks, class balance and leakage checks.
- Provide safe export of aggregate/de-identified learning data only after privacy review; never expose student identifiers, emails, free-text answers or raw individual performance through general dataset tools.
- Track source, license, consent/authorization, schema version and retention.
- Keep verification datasets access-restricted and immutable by fingerprint.

### Phase 5 — Admin UI and operational visibility
- Admin UI for datasets, jobs, model versions, evaluation evidence, active assignments and rollback.
- Show queue/worker availability and actionable failure messages.
- Show which student feature consumes each active model and whether inference is live, shadow, or fallback.
- Add monitoring for model drift and performance; no unsupported percentile/readiness claims.

## Security and correctness rules

- Model artifacts are referenced by URI and checksum; never upload executable model payloads into MCP arguments.
- Dataset creation is capped and rejects unexpected columns/types.
- Verification rows are read only with the verification scope and only from attested verification datasets.
- Training, registration, evaluation and activation require separate scopes.
- Activation requires a passing evaluation and explicit confirmation; preserve the previous active version for rollback.
- MCP-reported evaluation metrics are marked admin-attested until a trusted evaluator worker computes them.
- A queued job is not a trained model. A registered model is not automatically used by student features. An active registry version changes runtime behavior only after a feature has an explicit model-loader integration.
