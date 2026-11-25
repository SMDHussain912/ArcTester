# ArcTester Admin MCP — Model Control Plan

**Status:** Admin MCP control plane plus initial asynchronous training worker implemented on this branch  
**Owner surface:** Administrator MCP at `/mcp/admin`  
**Principle:** The MCP is a model control plane. It must not claim evaluation or student inference unless a real evaluator/runtime has done so.

## Current implementation in this branch

- Expose existing PostgreSQL model tables through Prisma: `ModelDataset`, `ModelTrainingJob`, `RegisteredModel`, `ModelEvaluation`, `ModelRegistryAudit`, and `ModelDriftBucket`.
- Add independent least-privilege Admin MCP scopes for model read, dataset creation, verification-data read, training queue, model registration, evaluation, and activation.
- Create bounded, schema-checked, fingerprinted datasets with explicit provenance and dataset kind.
- Prevent verification datasets from being used as training inputs.
- Queue asynchronous training jobs and expose honest job/worker state.
- Run the separate `api/src/modelTrainingWorker.ts` process using `npm run model:worker`; it claims queued/expired jobs with a database lease.
- Train deterministic, native logistic-regression classification or linear-regression models with a seeded train/validation split and held-out metrics.
- Store compact model artifacts and SHA-256 metadata in the PostgreSQL model registry; the worker automatically registers the completed model as an inactive candidate version.
- Return only paginated rows from attested verification datasets.
- Allow admin registration of external candidate artifacts by URI and SHA-256; registration never activates a candidate.
- Record candidate-vs-baseline evaluation on an attested verification dataset.
- Activate one model version per `modelId` only after a passing evaluation and explicit confirmation.
- Audit registration, evaluation, activation, and worker training completion. MCP artifact metadata is allowlisted; trained weights are not returned by list-model tools.

## Delivery phases

### Phase 1 — Admin MCP control plane
Acceptance:
- Prisma schema matches existing PostgreSQL migrations and generated client.
- Dataset validation enforces exact columns, feature types, target type, size/row limits, and deterministic fingerprint.
- Model training jobs are queued with bounded settings and visible status.
- Model candidates can be registered, evaluated, and activated only through scoped tools and audit entries.
- CI tests, lint, build, migration checks and E2E pass.

### Phase 2 — Real training worker (initial slice implemented)
Implemented:
- Separate worker process; training does not run inside an API request.
- Supported tasks: classification (logistic regression) and regression (linear regression).
- Deterministic split, feature encoding/normalization, held-out accuracy/MAE, and reproducible seed.
- Job claiming uses conditional updates and leases so multiple workers do not claim the same live job.
- Completed jobs create an inactive registered candidate with checksum and training metrics.

Remaining before calling this phase production-complete:
- Object storage for larger artifacts; current native linear artifacts are stored in PostgreSQL and intended only for compact models.
- Heartbeat, cancellation, explicit retry/backoff policy, and deployment resource limits.
- Worker integration tests for lease expiry and failure recovery.
- Deployment of a separate worker process with its own resource budget and monitoring.

### Phase 3 — Trusted evaluation and student inference
- Add an evaluator worker that consumes verification datasets without training on them.
- Compute task-specific metrics from actual predictions, not manually supplied claims.
- Record traceable evaluation evidence with dataset fingerprint, sample count, baseline version and candidate version.
- Add feature-to-model assignments (e.g. `readiness_classifier`, `question_difficulty`, `recommendation_ranker`) with versioned configuration.
- Make each feature explicitly load its assigned registered model through the prediction runtime; keep deterministic/rule-based fallback.
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
