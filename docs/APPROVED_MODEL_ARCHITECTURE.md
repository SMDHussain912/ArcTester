# ArcTester Intelligence — Approved Model Architecture

**Status:** Architecture approved; core implementation and integration in progress  
**Repository:** `smdgamekingindo-TN/ArcTester`  
**Runtime constraints:** Node.js + TypeScript API, PostgreSQL/Prisma, Vercel web, Render API, CPU-first deployment. No self-hosted LLM or Python inference service.

This document defines the six approved model capabilities and their qualification contracts. The implementation snapshot at the end records the code currently present; implementation or training does not imply qualification or production activation.

## 1. Shared architecture and data rules

- Reuse `Attempt`, `AttemptAnswer`, `ExamSubmission`, `ExamSubmissionAnswer`, `ExamVersionQuestion`, `ExamSession`, and `ExamSessionEvent`. Do not create duplicate answer, attempt, or session tracking tables.
- Practice and formal examination records remain separately labeled. Only completed practice attempts and verified `GRADED` formal submissions contribute to outcome labels. Exclude `REVIEW_REQUIRED` submissions from verified score targets.
- All training examples are built server-side from point-in-time snapshots. Features for a prediction at time T may use only events recorded before T. Never include future scores, post-exam events, answer keys, or post-submission grading fields as predictors.
- Group all rows from one learner into one split using keyed HMAC-SHA-256 pseudonyms. Never store raw student IDs, email addresses, names, IP addresses, or device identifiers in training datasets.
- Longitudinal tasks additionally use chronological walk-forward evaluation. Do not randomly split adjacent attempts from the same learner between train and test.
- Dataset versions are immutable and fingerprinted. Record source, extraction timestamp, feature schema version, target definition, row/group counts, exclusions, and consent/authorization attestation.
- Every model artifact records model ID/version, algorithm, task, feature schema/version, target, dataset fingerprint, split strategy, training configuration, metrics, runtime compatibility, creation time, and approval state.
- Synthetic data is for pipeline/UI testing only. It cannot qualify a model for student-facing predictions.
- Candidate models never auto-promote. Promotion requires holdout evidence, baseline comparison, privacy review, human approval, and a rollback-capable registry version.
- Predictions must return a status such as `ready`, `insufficient_data`, `stale_model`, or `fallback`. Never fabricate confidence when the model is unsupported or data is insufficient.
- The Model Lab is an administrator-only web feature. Mobile remains a student client and must not expose dataset, training, registry, or governance controls.

## 2. Model contracts

### 2.1 Gradient Boosting — performance prediction

**ID:** `performance-gradient-boosting`  
**Task:** Regression; predict the next completed practice-attempt accuracy percentage.

**Inputs (point-in-time features):**
- `completed_attempts`: count of completed practice attempts before prediction time.
- `previous_accuracy`: accuracy of the immediately previous completed attempt, 0–1.
- `recent_accuracy_mean_3`: mean accuracy of the previous three completed attempts, 0–1.
- `overall_accuracy_mean`: cumulative completed-attempt accuracy, 0–1.
- `previous_question_count`: number of answered questions in the previous attempt.
- `recent_accuracy_slope_3`: least-squares trend across up to the previous three attempt accuracies; null is represented by a missing-value mask, not zero.
- `subject_accuracy_vector`: per-subject accuracy over a fixed, versioned subject vocabulary; absent subjects are explicitly missing.
- `topic_coverage_ratio`: distinct topics attempted / topics available at prediction time.
- `days_since_last_attempt`: nonnegative elapsed days, capped at 90.

No raw text, identity, IP, device, answer key, or future exam outcome is permitted.

**Output:**
`{ predictionPercent: number, predictionInterval: { lowerPercent: number, upperPercent: number }, modelVersion: number, status: "ready" | "insufficient_data" | "fallback", explanation: { topFactors: { feature: string, direction: "positive" | "negative", contribution: number }[] } }`.
Clamp displayed percentages to 0–100; retain unclamped diagnostics for evaluation.

**Training dataset:** one row per eligible completed attempt after at least three prior completed attempts. Target is the current attempt's answered accuracy (correct / (correct + incorrect)); unanswered is reported separately and is not silently treated as incorrect. Build features from earlier attempts only. Require at least 500 eligible rows and 50 distinct learner groups before candidate qualification; use a 70/15/15 chronological/group-aware train-validation-test design and rolling-origin folds. Dataset must contain both improving and declining trajectories.

**Evaluation:** MAE and RMSE in percentage points; compare against previous-attempt, rolling-mean, and population-mean baselines. Report R² as secondary only. Require lower MAE and RMSE than the strongest baseline on untouched test folds, calibration/coverage of prediction intervals, and subgroup error checks. Track feature drift and residual drift after deployment.

**Deployment/integration:** train in the API background worker; store versioned JSON tree ensemble artifacts in the existing model registry. Serve through the performance prediction service, initially as an opt-in shadow candidate beside the current walk-forward linear predictor. Do not replace the current predictor until it beats the baseline on real, group-isolated data. Surface only a qualified estimate in the student performance dashboard and use top factors for the explanation panel.

### 2.2 Random Forest — performance prediction and feature importance

**ID:** `performance-random-forest`  
**Task:** Regression; same target and feature contract as Gradient Boosting.

**Inputs:** exactly the versioned performance feature vector in §2.1. The model must reject missing/unknown feature names and apply the artifact's stored preprocessing.

**Output:**
`{ predictionPercent: number, predictionInterval: { lowerPercent: number, upperPercent: number }, featureImportance: { feature: string, importance: number }[], modelVersion: number, status: "ready" | "insufficient_data" | "fallback" }`.
Importance is normalized to sum to 1 and labeled as global model importance, not causal influence or an individual student's explanation.

**Training dataset:** the exact same immutable performance dataset version and splits as Gradient Boosting so comparisons are paired and fair. Require at least 500 eligible rows and 50 learner groups. Fit preprocessing on training folds only.

**Evaluation:** MAE, RMSE, R² (secondary), interval coverage, fold variance, subgroup errors, and inference latency. Compare against the same three baselines and Gradient Boosting on identical test folds. Feature importance stability is measured across folds; do not promote if rankings are unstable or if performance does not beat the strongest baseline.

**Deployment/integration:** API worker and registry, shadow inference beside Gradient Boosting and the existing linear predictor. Model Lab shows paired metrics and fold-stability importance. Student-facing feature explanations must be generated from local per-prediction contributions (e.g. permutation/SHAP-compatible explanation) rather than presenting global importance as a personal reason.

### 2.3 Readiness Classifier — exam readiness categories

**ID:** `exam-readiness-classifier`  
**Task:** Three-class classification: `NOT_READY`, `DEVELOPING`, `READY`.

**Inputs (all computed before the prediction date):**
- `practice_accuracy_3`, `practice_accuracy_10`: recent accuracy over last 3 and 10 completed attempts.
- `subject_accuracy`: accuracy vector by ECET subject.
- `topic_coverage_ratio`: covered topics / available topics.
- `mock_completion_ratio`: completed questions / assigned questions in completed mock attempts.
- `attempt_consistency`: coefficient of variation of attempt accuracy over last 10 attempts.
- `days_since_last_attempt`.
- `full_mock_count`: count of completed full-length mock attempts.
- `recent_full_mock_accuracy`: most recent eligible full-length mock accuracy.

**Label definition:** derive from the next eligible, independently completed full-length mock exam after the feature timestamp. Initial policy thresholds: below 50% = `NOT_READY`; 50% to below 70% = `DEVELOPING`; 70% or above = `READY`. Keep thresholds in a versioned readiness policy so they can be reviewed and changed without silently relabeling historical datasets. This is a readiness indicator, not a guarantee of passing ECET.

**Output:**
`{ category: "NOT_READY" | "DEVELOPING" | "READY", probabilities: { NOT_READY: number, DEVELOPING: number, READY: number }, confidence: number, modelVersion: number, status: "ready" | "insufficient_data" | "fallback", factors: { feature: string, direction: string }[] }`.
Probabilities sum to 1. Low-confidence or out-of-distribution cases return a deterministic status instead of a confident category.

**Training dataset:** point-in-time learner snapshots paired with the next eligible full-length mock outcome. Exclude snapshots without a future label, snapshots with fewer than five prior completed practice attempts, and review-required/ungraded formal submissions. Require at least 1,000 snapshots, 100 distinct learner groups, and at least 100 examples per class before qualification. Use group-isolated chronological splits; no future mock data in features.

**Evaluation:** macro-F1, per-class precision/recall, balanced accuracy, confusion matrix, multiclass log loss, Brier score, expected calibration error, and false-READY rate. Set a strict ceiling for false-READY (initial target <=5% on test data) and review subgroup calibration. Accuracy alone is insufficient.

**Deployment/integration:** API readiness service; registry version and readiness policy version accompany every response. Show category and uncertainty in the student dashboard with a clear non-guarantee label. Admin analytics aggregate readiness categories only above privacy cohort thresholds. The model must never make exam access, grading, or eligibility decisions.

### 2.4 Adaptive Learning — personalized next-question selection

**ID:** `adaptive-question-selector`  
**Task:** Contextual ranking / learning-to-rank decision policy, not a score predictor.

**Inputs:**
- Learner state: subject/topic mastery estimates, recent correct/incorrect/unanswered counts, recency, exposure count, and uncertainty per topic.
- Candidate question metadata: question ID, subject, topic, difficulty, estimated discrimination/difficulty only when supported by enough attempts, and last-seen interval.
- Session constraints: selected subject/topic scope, remaining question count, target difficulty, excluded/recent question IDs, and practice mode.
- Policy context: exploration budget, repetition cooldown, safety filters, and current policy version.

Question content and answer keys are not passed to the ranker. The server retrieves the selected question after ranking and enforces existing access rules.

**Output:**
`{ rankedQuestionIds: string[], scores: number[], reasons: { questionId: string, reasonCode: "WEAK_TOPIC" | "SPACED_REVIEW" | "DIFFICULTY_FIT" | "NOVELTY" | "MIXED_PRACTICE" }[], policyVersion: number, fallbackUsed: boolean }`.
Always respect requested subject/topic filters, no-duplicate constraints, and available question count.

**Training dataset:** sequential decision records built from completed practice sessions: state at selection time, eligible candidate set, selected question, exposure propensity, answer outcome, subsequent topic mastery change over a fixed horizon, and censoring/availability fields. Reuse Attempt/AttemptAnswer snapshots; do not infer a reward from unanswered or abandoned attempts. The current deterministic top-k policy records eligible sets, scores, policy versions and answer outcomes with keyed-HMAC learner pseudonyms. Its selected-item inclusion indicator is 1 because selection is deterministic; do not treat these logs as randomized propensities or use them for inverse-propensity evaluation. Add bounded randomized exploration with logged conditional probabilities before counterfactual policy evaluation or fitting a contextual bandit/ranker. Require at least 10,000 eligible decisions across 200 learner groups and adequate coverage across subjects/difficulty buckets before offline policy evaluation.

**Evaluation:** offline NDCG@K / Recall@K against expert weak-topic labels, inverse-propensity-weighted reward, counterfactual policy value with confidence intervals, topic coverage, repetition rate, difficulty distribution, and fairness across subjects. Online rollout uses randomized, bounded A/B tests with guardrails: completion rate, learning gain on later independent questions, and no material increase in frustration/abandonment. Never optimize only immediate correctness.

**Deployment/integration:** deterministic baseline remains default. Run the learned ranker in shadow mode, then a small opt-in experiment, behind the existing practice-question selection service. Student web and mobile both call the same server-side selection endpoint; the Model Lab controls candidate policy evaluation and rollout, not student-specific manual overrides.

### 2.5 Question Embeddings — semantic search and question relationships

**ID:** `question-semantic-embeddings`  
**Task:** Vector representation and nearest-neighbor retrieval; not a correctness predictor.

**Inputs:** normalized question stem plus subject/topic context and approved explanation text. Exclude options containing the answer key, correct option index, private student responses, and any learner identifiers. Keep source text/version hash so embeddings can be invalidated when content changes.

**Output:**
`{ questionId: number, embedding: number[384], embeddingModel: string, embeddingVersion: number, sourceHash: string }`.
Search output:
`{ matches: { questionId: number, similarity: number, relation: "SEMANTICALLY_SIMILAR" | "SAME_CONCEPT" | "POSSIBLE_DUPLICATE" }[], indexVersion: number }`.
Similarity is a retrieval score, not a probability.

**Training/index dataset:** current approved question bank and curated concept/topic labels. The implementation uses `Xenova/paraphrase-multilingual-MiniLM-L12-v2` at pinned revision `2c4055b12046f11709e9df2c122e59ffbdc2f900`, with the explicit ONNX int8 weights and mean-pooled normalized 384-dimensional output. A worker persists vectors with model/version/source hashes and processes admin-triggered rebuild jobs in bounded batches. Create positive pairs from same concept/topic and reviewed duplicate pairs; hard negatives from same subject but different concepts. Human-reviewed pairs are the evaluation gold set. Do not train embeddings from synthetic learner rows.

**Evaluation:** Recall@5/10, Precision@5/10, nDCG@10, MRR, duplicate-detection precision/recall, per-subject retrieval quality, and latency/memory budget. Require human review of false-positive duplicate suggestions before any merge or deletion.

**Deployment/integration:** an admin-only rebuild queue and API worker persist vectors in a dedicated PostgreSQL table; the worker loads the pinned ONNX model lazily and processes bounded batches with resumable leases. Create/edit/import now enqueue targeted re-embedding jobs, and the admin semantic-search endpoint compares against a bounded candidate window (up to 500 matching model/version vectors), never loading the full vector table per request. Human-reviewed retrieval evaluation, production-scale index strategy and latency benchmarks remain to be completed. Vercel is only the UI; inference/indexing belongs on the API worker.

### 2.6 Exam Anomaly Detection — flag unusual sessions for human review

**ID:** `exam-session-anomaly`  
**Task:** Unsupervised anomaly scoring with deterministic rule signals; human review only.

**Inputs (server-observed session telemetry):**
- `focus_loss_count`, `disconnect_count`, `heartbeat_gap_count`, `heartbeat_gap_max_seconds`.
- `answer_change_count`, `rapid_answer_burst_count`, `submission_retry_count`.
- `session_duration_ratio` (observed duration / configured duration).
- `event_rate_deviation` from the student's own historical baseline only when sufficient history exists.
- `client_kind` as a coarse supported-client category; no raw user agent, IP, device fingerprint, or precise location.
- Exam policy settings and event availability/telemetry completeness.

**Output:**
`{ anomalyScore: number, severity: "LOW" | "MEDIUM" | "HIGH", reasonCodes: string[], telemetryCoverage: number, modelVersion: number, reviewRequired: boolean }`.
No cheating probability, guilt label, automatic penalty, auto-fail, or auto-termination is produced. Missing telemetry lowers coverage and must not be treated as suspicious by itself.

**Training dataset:** completed ExamSession/ExamSessionEvent aggregates, grouped by pseudonymous learner and exam cohort. Exclude sessions with incomplete telemetry from primary fit; keep a separate missingness indicator. Initial model is Isolation Forest trained on a reviewed normal-session reference set, combined with explicit policy rules. Human adjudication outcomes can later calibrate thresholds; do not treat an unreviewed flag as a positive label. Require at least 2,000 sessions and 200 learner groups for an initial candidate, with cohort-specific validation.

**Evaluation:** precision@review-capacity, false-positive rate on adjudicated normal sessions, recall on independently adjudicated incidents, alert rate per 100 sessions, calibration after labels exist, and subgroup/client-kind false-positive analysis. Thresholds are selected to fit a human review budget. Evaluate telemetry-missing sessions separately.

**Deployment/integration:** aggregate features server-side after session completion; store model score/reason codes in a review record linked to the existing session, without changing the authoritative exam result. Admin Live Monitor / Review Queue displays evidence and telemetry coverage. A human reviewer records the disposition. Model output cannot trigger grading, discipline, exam invalidation, or session termination.

## 3. Model Lab and registry contract

The administrator Model Lab will be organized around:
1. **Model portfolio:** the six approved capabilities, their purpose, current state, required dataset, and qualification gates.
2. **Datasets:** immutable versions, provenance, schema, fingerprint, group count, label balance, and privacy attestation.
3. **Training & evaluation:** queued jobs, live epoch metrics only for epoch-based trainers, split strategy, baselines, fold metrics, and failure details.
4. **Registry:** candidate/active/retired versions, feature schema compatibility, evaluation evidence, promotion and rollback audit.
5. **Diagnostics:** prediction test inputs, drift, latency, and model health. Do not show a test action for a model without a registered inference adapter.
6. **Governance:** explicit approve/promote/retire/delete actions, confirmation, actor, timestamp, and immutable audit events.

Do not represent all six models as trainable from one generic dataset form. Each model has its own task-specific dataset builder and validator. Hide controls that do not apply to the selected model. Keep TensorFlow epoch/batch-size controls scoped to TensorFlow training only. Classical training has no live epoch chart unless its trainer emits actual incremental metrics.

## 4. Existing models and cleanup policy

The current registry supports multiple linear regression, logistic regression, k-nearest neighbors, decision tree, and Gaussian naive Bayes, plus a separate TensorFlow.js regression path. These are existing baseline/legacy algorithms, not the six newly approved capabilities.

- Keep the existing linear regression predictor as a baseline and fallback until a replacement passes qualification.
- Keep logistic regression as a simple classification baseline for readiness experiments where useful.
- Do not expose generic KNN, decision-tree, or Gaussian-naive-Bayes options as standalone product models unless a measured benchmark demonstrates a distinct value. Retain old artifacts for audit/rollback; mark them `LEGACY`/non-promotable rather than deleting records or migration history.
- TensorFlow.js remains an optional regression experiment, not a seventh student-facing model. Keep it only while it provides measurable value and fits Render memory/latency constraints.
- Remove duplicated UI controls and unused model-prefix configuration only after confirming API and tests no longer depend on them. Never delete datasets or model artifacts that are referenced by evaluations, jobs, audit events, or active versions.

## 5. Rollout order

1. Model Lab portfolio and registry cleanup; no new inference models.
2. Dataset contracts/builders and privacy-safe extraction tests for the six model types.
3. Performance models (Gradient Boosting and Random Forest) in shadow mode against the current linear baseline.
4. Readiness classifier after enough independent full-length mock labels exist.
5. Question embeddings and duplicate-review workflow.
6. Adaptive learning after propensity logging and offline policy evaluation.
7. Exam anomaly scoring after telemetry completeness and human-review workflow are verified.

**Approval outcome:** All six proposals are approved as architecture targets. None is authorized for training, activation, or student-facing use by this document alone.

## 8. Implementation snapshot (2026-11-19)

This section records implementation progress separately from the qualification gates above.

| Capability | Implemented | Remaining before student-facing production use |
|---|---|---|
| Gradient Boosting | CPU regression-tree ensemble, deterministic training, prediction, feature importance, registered-dataset training and registry validation/inference | Point-in-time feature extraction, production-sized real datasets, walk-forward/group-isolated evaluation, stability and latency qualification |
| Random Forest | Bootstrap regression forest, randomized feature selection, prediction, feature importance, registered-dataset training and registry validation/inference | Same paired dataset and qualification work as Gradient Boosting |
| Readiness Classifier | Three-class softmax classifier, strict artifact validation, multiclass registry inference and admin training endpoint | Larger authorized labeled dataset, group-separated calibration, false-READY evaluation and promotion workflow for multiclass models |
| Adaptive Learning | Practice-paper selection ranks eligible questions using completed topic accuracy, question exposure, last-seen time and difficulty while preserving subject quotas; pseudonymous decision and answer-outcome logs are persisted | Randomized exploration with valid propensities, offline policy evaluation, larger-scale safeguards and monitoring |
| Question Embeddings | Pinned multilingual MiniLM ONNX int8 encoder, persistent 384-dimensional vectors, targeted create/edit/import re-embedding, resumable rebuild worker and bounded admin semantic search | Human-reviewed retrieval evaluation, production-scale index strategy and latency benchmarks |
| Exam Anomaly Detection | CPU Isolation Forest fitting/scoring, telemetry completeness guard, reason codes and conservative human-review output | Server-side session telemetry aggregation, baseline dataset extraction, durable review queue and false-positive evaluation |

### Current training and safety behavior

- Performance training creates inactive candidates; the linear baseline, Gradient Boosting and Random Forest use the same registered dataset and deterministic holdout split.
- Readiness training is available through the administrator Model Lab only for attested real-anonymized datasets. Numeric target encoding is 0 = NOT_READY, 1 = DEVELOPING, 2 = READY. The minimum training guard is 90 labeled rows, 30 distinct keyed learner groups, 30 examples per class, and 10 learner groups represented in each class. These are engineering minimums, not production qualification thresholds.
- Readiness inference returns insufficient_data below five completed attempts and fallback for out-of-distribution features or low confidence. It does not force a READY label.
- Adaptive practice uses only completed attempts to compute topic mastery; in-progress answers are excluded. Existing subject and topic filters remain authoritative.
- None of the newly implemented candidates is automatically promoted. Existing real-data provenance, independent evaluation and governance checks remain mandatory.