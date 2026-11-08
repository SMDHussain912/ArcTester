# ArcTester Intelligence — Development Roadmap

**Status:** Phase 1 analytics foundation implemented; Phase 2 intelligence work in progress  
**Project:** ArcTester — AP ECET CSE mock-test platform  
**Backend:** Node.js + TypeScript  
**Primary constraint:** No self-hosted LLM, no Python inference server, and no GPU dependency. Intelligence features must run within the existing Node.js backend and current server resource limits.

---

## 1. Vision

Build **ArcTester Intelligence**, a data-driven learning and assessment system that combines:

1. Analytics — explain what has happened.
2. Machine learning — estimate what may happen.
3. Recommendations — decide what the student should practise next.
4. Explanation generation — explain answers, mistakes, and performance using trusted question-bank content and structured templates.

Regression and classification models are not generative AI. They provide numerical predictions and category predictions. They will be combined with deterministic recommendation logic and a template/knowledge-base explanation engine. The first release will not claim to be a ChatGPT-like conversational model.

## 2. Architecture

```text
ArcTester Web / Student Dashboard / Admin Dashboard
                         |
                    Node.js API
                         |
              ArcTester Intelligence
        +----------------+----------------+
        |                |                |
     Analytics        ML Engine      Recommendations
        |          Regression +       Rules + content
        |          Classification       similarity
        |                |                |
        +----------------+----------------+
                         |
                 Explanation Engine
             Templates + concept knowledge
                         |
             Existing ArcTester database
       Questions / Topics / Attempts / Submissions
                         |
              Versioned model artifacts
                   (JSON initially)
```

### Design principles

- Reuse the existing ArcTester database and event history. Do not create duplicate attempt or answer tracking.
- Use real student attempts and immutable exam submission snapshots as the source of truth.
- Keep student data isolated by authenticated user ID.
- Never expose answer keys, private student data, or model-training features to unauthorized clients.
- Separate training from inference. Do not retrain models on every API request.
- Save model parameters and metadata as versioned JSON artifacts initially.
- Make predictions explainable: expose the features and reasons behind recommendations where practical.
- Show confidence and data sufficiency. Do not display predictions when there is insufficient history.
- Keep deterministic fallbacks available if a model artifact is missing or stale.
- Do not describe a heuristic as a trained ML model.

## 3. Data foundation and analytics

### Existing data to inspect and reuse

Before implementation, inspect the Prisma schema, routes, and tests for:

- Practice attempts and attempt answers.
- Exam assignments, exam submissions, and submission answers.
- Question bank questions, subjects, and topics.
- Question difficulty, marks, negative marks, and explanations.
- Existing analytics endpoints and student dashboard data.

Map the actual database fields before designing new tables or migrations. Prefer derived analytics queries over storing duplicate aggregates. Add persisted aggregates only if query performance requires them and their refresh strategy is defined.

### Phase 1 implementation log — 2026-11-08

**Implemented and pushed:**

- Replaced weak-topic accuracy derived from `Stat.wrong` with aggregation from completed `AttemptAnswer` records.
- Accuracy now uses `correct / (correct + incorrect)`; unanswered answers are counted separately and do not reduce answered accuracy. Accuracy is `null` when there are no answered questions.
- Completed practice history now excludes unfinished attempts.
- Added authenticated `GET /analytics/overview`:
  - Practice totals, answer outcomes, subject breakdown, and the latest 12 completed-attempt accuracy points.
  - Formal exam submission totals, verified `GRADED` results, separate `REVIEW_REQUIRED` count, score/maximum marks, answer outcomes and subject-level marks/accuracy.
  - Practice and formal exam scoring remain separate.
- Connected the student analytics page to the overview endpoint and added formal exam performance and recent practice trend sections.
- Added API integration coverage for practice accuracy, unanswered questions, unfinished attempts, formal exam aggregation, and student isolation.

**Important limitations still open in Phase 1:**

- Practice answer snapshots now preserve subject, topic, difficulty, question text, options, correct answer and explanation. The migration backfills existing rows from the question bank as it existed at migration time; metadata changes made before that migration cannot be reconstructed.
- Formal exam analytics currently count only `GRADED` answer outcomes in verified score and subject metrics. `REVIEW_REQUIRED` submissions are counted separately and excluded from those metrics.
- No trustworthy per-question timing data exists; no time-spent metric is exposed.
- Admin cohort analytics and deeper question-level analysis are not yet implemented.
- CI is now running through GitHub Actions. The last fully verified run (`42505842339`) passed API/web tests, lint, production builds, Prisma migration verification and mobile typecheck. Later analytics UI changes are being verified in a newer run.

**Commits in this implementation batch:**

- `deae513` — derive student accuracy from completed answers.
- `f4c37d3` — add source-separated performance analytics.
- `fafb28b` — expose student performance overview endpoint.
- `c2daeab` — add typed performance analytics client.
- `f78efe1` — show separate practice and formal exam analytics.
- `00977db` — cover analytics accuracy and student isolation.
- `e6124ec` — cover formal exam analytics aggregation.
- `7c61ff6` — clarify practice question metric breakdown.
- `94a5f54` — simplify practice trend aggregation.
- `98b2e4d` — avoid weak-area recommendations when there are no answered questions.
- `ca429fe` — verify review-required formal submissions stay outside verified metrics.
- `1da41d8` — initialize analytics test fixture state explicitly.

### Phase 0 audit — current repository findings (2026-11-08)

The audit inspected the Prisma schema, API route registration, practice-test service, analytics service/routes, formal exam routes, relevant API tests, and the student analytics page.

#### Existing data map

| Data | Authoritative current source | Fields / limitations |
|---|---|---|
| Practice attempts | `Attempt` | `userId`, `mode`, `startedAt`, `deadline`, `finishedAt`, `expired`. No per-question timing. |
| Practice answers | `AttemptAnswer` | `attemptId`, `questionId`, `chosen`, `isCorrect`, plus snapshots of subject, topic, difficulty, question text, options, correct answer and explanation. Rows are created when a test starts, initially unanswered. |
| Per-question aggregate | `Stat` | `userId`, `questionId`, `seen`, `wrong`, `lastSeen`. The `wrong` field is a changing wrongness/debt counter, not a cumulative count of incorrect answers. |
| Question-bank metadata | `Question`, `Subject`, `Topic` | Used when a practice attempt is created. `AttemptAnswer` snapshots preserve the metadata used for that attempt; legacy rows were backfilled by migration. |
| Formal exam submissions | `ExamSubmission` + `ExamAssignment` | Score, maximum score, started/submitted/received timestamps, status and student ownership. |
| Formal exam answers | `ExamSubmissionAnswer` | Selected option, correctness and awarded marks. |
| Immutable formal exam metadata | `ExamVersionQuestion` | Subject, topic, difficulty is not currently snapshotted, question content, marks and negative marks. Subject/topic/content remain stable for that exam version. |
| Existing student analytics | `analytics.ts` + `analyticsRoutes.ts` | Weak topics, history, recommendations, export/import. |
| Existing admin analytics | `GET /admin/analytics/overview` in `examRoutes.ts` | Aggregate counts and formal exam submission summaries. |
| Existing student UI | `web/app/analytics/page.tsx` | Reads weak topics, practice history and deterministic study recommendations. |

#### Confirmed correctness and coverage issues

1. **Weak-topic accuracy is currently unsuitable as a true accuracy metric.** `nextStat()` in `selection.ts` increments `wrong` for both wrong and unanswered outcomes, and reduces `wrong` after a correct answer. `getWeakTopics()` calculates `(seen - wrong) / seen`. This is a selection-priority signal, not cumulative actual wrong answers or defensible accuracy. Do not use this counter as an ML target or label.
2. **Practice history includes unfinished attempts.** `getHistory()` queries all attempts without filtering `finishedAt != null`; it counts initially-created answer rows, so an unfinished attempt can appear as a zero-score history item.
3. **Student analytics currently covers practice only.** `getHistory()`, `getWeakTopics()`, and `getStudyRecommendations()` read practice `Attempt`/`AttemptAnswer`/`Stat` data. Formal `ExamSubmission` data is not included in this student analytics flow. The admin overview separately reads formal exam assignments/submissions.
4. **Practice historical classification is now snapshotted.** New attempts retain the question metadata that was used when the attempt was created. Existing rows were backfilled from the question bank during migration, so any edits made before that migration cannot be recovered. The answer-to-question relation also prevents deleting a referenced question.
5. **Timing analytics are limited.** Practice attempts have start/deadline/finish timestamps, but no per-question duration. Formal exam start/submitted timestamps are client-supplied; `receivedAt` is server-generated. Do not infer precise per-question time or treat client timestamps as trusted telemetry.
6. **Formal exam grading needs status-aware treatment.** Submissions may be `GRADED` or `REVIEW_REQUIRED`. Analytics must preserve this distinction and must not present review-required results as fully verified outcomes without an explicit policy.
7. **Existing privacy boundary is a useful foundation.** Student analytics routes pass the authenticated user's ID into service functions. New student queries must continue to scope all practice and formal exam records to that user. Admin aggregates must not expose raw private student-level data unnecessarily.

#### Phase 1 data and metric decisions

- Use completed practice attempts only (`finishedAt != null`) for completed-attempt history and performance metrics.
- Derive practice correct / incorrect / unanswered counts from `AttemptAnswer.chosen` and `AttemptAnswer.isCorrect`, not from `Stat.wrong`.
- Define answered accuracy as `correct / (correct + incorrect)`; report unanswered separately. If no questions were answered, accuracy is `null`, not zero.
- Keep practice and formal exam results identifiable as separate assessment sources. Compare percentages only where the scoring denominator is valid; never add raw practice scores to weighted exam marks.
- For formal exams, include submission status and distinguish review-required records from verified graded results.
- Use immutable `ExamVersionQuestion` metadata for formal exam topic analysis.
- For practice topic analysis, use the `AttemptAnswer` subject/topic/difficulty snapshots. Treat pre-migration history as best-effort because its backfill reflects the question bank at migration time.
- Treat `Stat` as a question-selection aid only until its semantics are redesigned or replaced; do not delete it as part of the analytics work.
- Keep time-based insights coarse and explicitly labeled until trustworthy timing events exist.

#### Phase 0 outcome

**Audit complete.** The current schema and routes are sufficient to begin a corrected analytics foundation without immediately introducing an ML-specific database or a new tracking subsystem. A practice-answer metadata snapshot migration is a design decision to settle during Phase 1 before historical topic analytics are treated as stable.

### Analytics metrics

Per student:
- Total practice attempts and completed exams.
- Average score and score trend.
- Accuracy and unanswered rate.
- Correct / incorrect counts.
- Time spent, only where reliable timing data exists.
- Subject-level and topic-level performance.
- Difficulty-level accuracy.
- Recent improvement or decline.
- Data coverage and last activity.

Per question:
- Attempt count.
- Correct rate and unanswered rate.
- Difficulty performance based on observed attempts.
- Commonly selected wrong options, if the stored answer data supports this.
- Topic and subject distribution.

Admin analytics:
- Overall participation and completion.
- Score distribution and average.
- Subject/topic performance.
- Question quality indicators.
- Cohort-level trends with privacy-aware aggregation.

**Metric rules:** Define denominators explicitly. Do not treat unanswered questions as incorrect in every metric; expose both accuracy among answered questions and overall completion/correctness where useful. Avoid mixing practice attempts with formal exam submissions without labeling the source.

## 4. Machine-learning engine

Implement core algorithms in TypeScript for learning, transparency, and control. Use a mature JavaScript/TypeScript library only where it clearly improves reliability or maintainability. Keep algorithms behind common interfaces so implementations can be replaced.

### 4.1 Regression

Purpose: predict continuous numerical values.

Planned models:
- Simple Linear Regression.
- Multiple Linear Regression.
- Polynomial Regression (only if validation justifies it).
- Ridge Regression (later, to reduce overfitting).

Potential ArcTester use cases:
- Estimate a student's next mock-test score.
- Estimate topic mastery as a numerical score.
- Estimate a performance trend over a defined period.

Potential features (to validate, not blindly assume):
- Recent scores and their trend.
- Number of completed attempts.
- Topic-level accuracy.
- Difficulty mix.
- Recency and frequency of practice.
- Exam duration and question count, where comparable.

Evaluation:
- MAE.
- RMSE.
- R-squared as a supplementary metric, not the only acceptance criterion.
- Time-based train/test split to avoid training on future data.

### 4.2 Classification

Purpose: predict a discrete category.

Planned models:
- Logistic Regression.
- K-Nearest Neighbors.
- Decision Tree.
- Naive Bayes (only where its assumptions are appropriate).

Potential ArcTester use cases:
- Topic mastery category: Weak / Developing / Strong.
- Readiness category: Not Ready / Nearly Ready / Ready.
- Risk category: Needs Attention / On Track.

Evaluation:
- Accuracy.
- Precision, recall, and F1.
- Confusion matrix.
- Class balance checks.
- Calibration or confidence checks where appropriate.

Labels must be defined from defensible rules or reviewed outcomes. Do not train a classifier on arbitrary labels generated from the same features and then present it as independently validated intelligence.

### 4.3 ML engineering requirements

- Feature extraction and preprocessing must be deterministic and versioned.
- Handle missing values explicitly.
- Normalize features when required by the algorithm.
- Split data by time and, where needed, by student to prevent leakage.
- Keep a baseline (e.g. mean-score predictor or simple rule) for comparison.
- Store model name, version, training timestamp, feature schema version, training-row count, evaluation metrics, and supported prediction range.
- Validate model artifacts before loading.
- Reject malformed or incompatible model artifacts safely.
- Provide a fallback when there is not enough training data.
- Do not train on a student's private data in a way that leaks it to another student's predictions.

## 5. Recommendation engine

Start with deterministic, testable recommendations. Add collaborative filtering only after enough activity exists.

### Stage A — Rule-based recommendations

- Detect weak topics using minimum attempt thresholds and clearly defined accuracy metrics.
- Recommend revision when evidence indicates repeated mistakes.
- Avoid repeatedly recommending the same item.
- Respect recent practice and cooldown windows.
- Prioritize prerequisite concepts when the knowledge map defines them.

### Stage B — Content-based recommendations

Rank practice questions using:
- Weak topic match.
- Appropriate difficulty.
- Question history (avoid recently repeated questions).
- Prerequisite/concept relationships.
- Student's recent performance.

Gradually increase difficulty as performance improves. Include a reason for each recommendation, such as: "Recommended because recent Graph questions have low accuracy."

### Stage C — Collaborative recommendations (later)

Use anonymized/aggregated patterns from students with similar learning histories only when sample sizes are sufficient. Apply privacy safeguards and avoid exposing other students' activity.

### Recommendation output contract (initial proposal)

Each recommendation should contain:
- Type (topic revision, question practice, mock test, concept review).
- Target subject/topic/question identifier.
- Priority.
- Short reason.
- Evidence summary.
- Generated timestamp.
- Optional expiry or refresh condition.

## 6. Explanation engine (without a hosted LLM)

The initial explanation engine is deterministic and grounded in trusted ArcTester content. It is not a free-form LLM.

### A. Answer explanations

- Use the explanation stored with the question.
- Show the correct answer and why it is correct after the relevant exam/result policy permits disclosure.
- Where supported by curated content, explain why common distractors are incorrect.

### B. Performance explanations

Generate natural-language summaries from actual metrics and detected patterns.

Example:
"Your recent accuracy in Data Structures is 48%. Most of your incorrect answers are from Trees and Graphs. Revise these topics and try a focused practice set."

The message must be generated from measured values, with thresholds and wording tested to avoid misleading claims.

### C. Concept knowledge base

Store curated concept information, for example:

```json
{
  "concept": "Queue",
  "definition": "A linear data structure that follows FIFO order.",
  "examples": ["Printer queue", "Task scheduling"],
  "relatedConcepts": ["Stack", "Linked List"],
  "commonMistakes": ["Confusing FIFO with LIFO"]
}
```

Build a concept lookup and template composer that can combine:
- Definitions.
- Examples.
- Related concepts.
- Common mistakes.
- Question-bank explanations.
- Student-specific error patterns.

Content should be curated/reviewed. Do not invent textbook facts from model output.

### D. Future optional provider

A third-party AI API may be added later behind a provider interface, with explicit configuration, rate limits, privacy review, and cost controls. It is not required for the first release and must not be silently enabled.

## 7. Proposed source layout

Adapt to the actual existing backend layout before creating files; do not force a large refactor if the current project conventions differ.

```text
api/src/intelligence/
  analytics/
    performance.ts
    topic-analysis.ts
    trends.ts
  ml/
    regression/
      linear-regression.ts
      polynomial-regression.ts
    classification/
      logistic-regression.ts
      knn.ts
      decision-tree.ts
    preprocessing/
      normalization.ts
      feature-extraction.ts
    model-manager.ts
  recommendations/
    weak-topics.ts
    question-recommender.ts
    learning-path.ts
  explanations/
    answer-explainer.ts
    performance-explainer.ts
    concept-knowledge.ts
    templates.ts
  routes/
    intelligenceRoutes.ts
```

Potential API endpoints (final paths and response contracts must follow existing route conventions):
- Student: analytics overview.
- Student: subject/topic breakdown.
- Student: recommendations.
- Student: answer/performance explanations.
- Admin: aggregated analytics.
- Admin: model status and evaluation metadata (no private training rows).

## 8. Development phases and acceptance criteria

### Phase 0 — Repository and data audit
- Inspect current Prisma schema, API routes, analytics implementation, frontend pages, and tests.
- Map the authoritative source for every metric.
- Identify missing or unreliable timing fields.
- Document data isolation and result-release constraints.
- No new ML claims or migrations before this audit.

**Done when:** A field-level data map and implementation plan are committed, with tests identified.

### Phase 1 — Analytics foundation
- Implement reliable student performance aggregation.
- Add subject/topic breakdown and trends.
- Add admin-level aggregate analytics.
- Add tests for empty history, unanswered questions, negative marks, multiple attempts, and student isolation.
- Build student-facing analytics UI.

**Done when:** Metrics match known test fixtures and do not leak another student's data.

### Phase 2 — Weak-area detection
- Define minimum evidence thresholds.
- Identify weak topics and repeated error patterns.
- Add deterministic explanations for detected patterns.
- Add tests for low sample counts and borderline thresholds.

**Done when:** Recommendations are reproducible and every result has an evidence-based reason.

### Phase 3 — Regression engine
- Implement and test linear regression and feature preprocessing.
- Create training/evaluation pipeline.
- Compare against a simple baseline.
- Save/load versioned JSON artifacts.
- Add prediction API with data sufficiency checks.

**Done when:** Model evaluation is reproducible, artifacts are validated, and predictions beat or justify comparison with the baseline.

### Phase 4 — Classification engine
- Implement logistic regression first.
- Add KNN and decision tree only when useful.
- Define labels and evaluate class imbalance.
- Expose confidence and fallback behavior.

**Done when:** Evaluation metrics and limitations are visible; no unsupported readiness claims are made.

### Phase 5 — Personalized recommendations
- Build topic revision and question recommendation ranking.
- Add difficulty adaptation and repetition controls.
- Include reasons and evidence.
- Add recommendation feedback if the UI supports it.

**Done when:** Recommendations are relevant, explainable, tested, and respect student isolation.

### Phase 6 — Explanation engine
- Build answer explanation rendering.
- Build curated concept knowledge structure.
- Build metric-grounded performance explanation templates.
- Add tests to ensure explanations never reveal protected answers before release.

**Done when:** Explanations are grounded in stored/curated content and respect exam result policies.

### Phase 7 — Admin model operations
- Model metadata and version management.
- Training job status and safe retraining workflow.
- Evaluation history and model rollback.
- Monitoring for stale artifacts and data drift.

**Done when:** Admins can inspect model health without accessing sensitive raw student data.

### Phase 8 — Integration and polish
- Integrate student dashboard widgets.
- Integrate admin analytics.
- Add loading, empty, error, and insufficient-data states.
- Run full frontend and API tests, lint, formatting, and production builds.
- Document deployment and rollback.

**Done when:** Full monorepo verification passes and features work with production-like data.

## 9. Non-goals for the first release

- Hosting a large language model.
- Claiming regression/classification is generative AI.
- Training a model on every API request.
- Making high-stakes academic decisions automatically.
- Collaborative filtering before sufficient data exists.
- Generating unverified textbook explanations.
- Exposing student-level analytics to other students.

## 10. Continuation and progress tracking

This file is the durable source of truth for the ArcTester Intelligence workstream. At the end of each implementation session:

1. Update the phase status and completed acceptance criteria.
2. Record commits and files changed.
3. Record tests actually run and their exact results.
4. Record known failures, limitations, and next tasks.
5. Do not mark a phase complete based only on code being written.
6. In a new chat, read this file and inspect the current repository state before continuing. Do not rely only on an old chat summary.

### Current progress

- [x] Intelligence architecture and constraints documented.
- [x] Initial algorithms, use cases, and phases defined.
- [x] Phase 0 — repository/data audit (completed 2026-11-08; findings recorded above).
- [ ] Phase 1 — analytics foundation (in progress; student practice/formal analytics, historical practice metadata snapshots, admin cohort aggregates and initial dashboard integrations committed; verification and remaining coverage pending).
- [ ] Phase 2 — weak-area detection (threshold-based recommendations and 7-day recent-practice cooldown implemented; final acceptance/UI review pending).
- [ ] Phase 3 — regression engine (initial TypeScript multiple-linear-regression core implemented and CI-verified; training pipeline, baseline comparison, artifact persistence and prediction integration remain).
- [ ] Phase 4 — classification engine.
- [ ] Phase 5 — personalized recommendations.
- [ ] Phase 6 — explanation engine.
- [ ] Phase 7 — admin model operations.
- [ ] Phase 8 — integration and polish.

**Important:** No ArcTester Intelligence implementation is claimed complete by this planning document.


### Phase 1 implementation log — 2026-11-08 (continued)

**Implemented in this batch**
- Added immutable practice-answer classification fields: subject, topic and difficulty snapshots.
- Added a SQLite migration that backfills existing answer rows from the current question bank at migration time.
- New practice attempts now save classification snapshots when their answer rows are created.
- Student weak-topic analytics uses snapshots, with a legacy fallback for rows that have no snapshot.
- Progress imports create snapshots for imported answers using the question metadata available at import time.
- Progress exports now include snapshot metadata, and imports preserve those values; older backup files remain accepted and use current metadata as a fallback.
- Student analytics now returns a separate topic-level breakdown, and the dashboard displays subject and topic performance independently.
- Fixed the subject accuracy progress bar for unanswered-only groups where accuracy is `null`.
- Added an admin endpoint test covering cohort aggregation and the exclusion of REVIEW_REQUIRED answers from verified question metrics.
- Added a regression test that edits a question's subject, topic and difficulty after an attempt and checks that its historical subject classification remains unchanged.
- Expanded admin analytics with student-cohort practice totals and subject accuracy, plus verified graded-exam question metrics. REVIEW_REQUIRED submissions are counted separately and excluded from verified metrics.
- Expanded admin cohort analytics to include separate subject and topic breakdowns for practice and verified formal exams.
- Admin cohort queries are scoped to student accounts; administrator practice activity is not mixed into student metrics.
- Updated the admin dashboard with subject/topic tables for both assessment sources.
- Removed the obsolete GitHub Actions references from the README after deleting the workflow.
- Updated the admin dashboard to display practice and verified formal-exam cohort analytics.
- Removed the unused `.github/workflows/ci.yml` workflow from the fork. This does not alter Render or Vercel deployment configuration.

**Files changed**
- `api/prisma/schema.prisma`
- `api/prisma/migrations/20261108120000_practice_answer_metadata/migration.sql`
- `api/src/testService.ts`
- `api/src/analytics.ts`
- `api/src/examRoutes.ts`
- `api/tests/analytics.test.ts`
- `web/lib/api.ts`
- `web/app/admin/page.tsx`
- `web/app/analytics/page.tsx`
- `web/app/analytics/page.test.tsx`
- `README.md` (removed obsolete GitHub Actions references)
- `.github/workflows/ci.yml` (deleted)

**Verification state**
- Tests, Prisma migration execution, lint, typecheck and production builds have not been run in this environment.
- The GitHub Actions workflow has been removed, so it will not provide CI verification.
- Historical subject/topic snapshots protect against later metadata edits. Existing question deletion still cascades to practice answers; preserving attempts after question deletion would require a separate relationship/data-retention change and remains open.
- Existing practice answers are backfilled from the question metadata present when the migration runs; metadata changes that happened before this migration cannot be reconstructed.

**Next**
1. Run Prisma migration and regenerate the client in the user's environment.
2. Run API analytics tests and resolve any schema/fixture issues.
3. Add question-level aggregates and minimum-sample safeguards.
4. Review the admin analytics page on desktop/mobile and finish Phase 1 acceptance coverage.


### Verification fixes — 2026-11-08

The user's local run exposed issues after the Phase 1 analytics batch. Fixes pushed:
- Made the analytics API test fixtures deterministic by looking up each selected question's correct answer instead of assuming the first option is correct. The question selector can return either Maths question.
- Removed an unused unanswered counter from the practice trend calculation; unanswered items remain excluded from the accuracy denominator and are still included in total question counts.
- Updated student analytics page test mocks to provide the new `/analytics/overview` response and the `topics` collection.
- Updated the empty-state analytics mock to return an empty topic collection.

**Verification:** The user confirmed that all tests passed after these fixes. This confirmation applies to the verification-fix commit, not to later question-level analytics changes.


### Question-level analytics — 2026-11-08 (implementation in progress)

**Implemented in this batch**
- Added authenticated `GET /analytics/question-performance` for the current student only.
- Per-question practice metrics include subject/topic/difficulty snapshots, answered sample size, correct/incorrect/unanswered counts and accuracy.
- Added a minimum evidence threshold of **5 answered attempts**. A question is flagged weak only when it has at least 5 answered attempts and accuracy below **60%**.
- Unanswered attempts are reported but do not inflate the accuracy sample size.
- Added a student dashboard section explaining the threshold and displaying only evidence-qualified weak questions.
- Added cohort-level practice question performance to the admin analytics endpoint and dashboard. A cohort question signal requires at least 5 answered attempts from at least 3 distinct students, with accuracy below 60%. Only completed practice attempts from STUDENT accounts are aggregated; student identifiers are used internally for the distinct-student check and are not returned.
- Added tests for the minimum-sample boundary, unanswered answers not counting toward the threshold, student data isolation, the student dashboard display, the admin response contract, and the 3-distinct-student cohort requirement.

**Files changed**
- `api/src/analytics.ts`
- `api/src/analyticsRoutes.ts`
- `api/src/examRoutes.ts`
- `api/tests/analytics.test.ts`
- `api/tests/exams.test.ts`
- `web/lib/api.ts`
- `web/app/analytics/page.tsx`
- `web/app/analytics/page.test.tsx`
- `web/app/admin/page.tsx`

**Verification**
- Implementation and regression tests have been pushed, but this batch has not yet been run locally.
- Student flags use at least 5 answered attempts and accuracy below 60%. Admin cohort flags additionally require at least 3 distinct students. These are transparent heuristics, not statistical significance claims.
- Question-level cohort metrics currently cover practice answers. Formal exam subject/topic analytics remain available separately; per-question formal exam cohort aggregation can be added after this pass is verified.

**Next**
1. Run API and web tests, lint and production builds.
2. Fix any TypeScript/Prisma/test issues reported by the local run.
3. Review student and admin analytics layouts on desktop and mobile.
4. Only then close Phase 1 and proceed to Phase 2 weak-area detection/recommendation safeguards.


### Local verification follow-up — 2026-11-08

The user's local run reported 112/114 API tests passing, with two fixture expectation failures:
- The progress-import round-trip restored only the original four questions, while the exported analytics payload also referenced the fifth question created by the minimum-sample test. Updated the fresh restore database fixture to include that question, preserving matching question IDs.
- The admin analytics test now creates a third STUDENT account to prove the three-distinct-student safeguard. Updated the expected admin student total from two to three.

**Status:** Both test fixtures have been corrected and pushed. The user must rerun `npm test` to confirm. The supplied run showed no lint/build errors, but the two API test failures mean the overall verification run was not green.

### Local verification and admin UI review — 2026-11-08

**User-confirmed verification on commit `7e462b7`:**
- Web tests: 59/59 passed.
- API tests: 114/114 passed.
- Total: 173/173 passed.
- The supplied terminal output shows both web and API production builds completing; lint commands returned without reported errors.
- Vite emitted a non-blocking CJS Node API deprecation warning.

**Admin exam-creation review found and fixed:**
- The create-exam form exposed shuffle-question, shuffle-option, marks-per-question and negative-marks controls, but the submit handler sent hard-coded defaults.
- Updated the request payload to send the selected shuffle settings and the configured marks values for every selected question.
- Commit: `48a82cf` — `fix(admin): honor mock exam creation settings`.

**Verification status:** The 173 passing tests apply to commit `7e462b7`, before the admin UI payload fix. The new fix has been pushed but still requires local test, lint and build verification. Desktop/mobile admin UI review remains open; Phase 1 is not closed.

### Phase 2 — evidence-based weak-area recommendations (implementation batch) — 2026-11-08

**Implemented and pushed**
- Replaced the previous "weakest subject wins" recommendation rule. A low-accuracy subject or topic with only one or two answers is no longer presented as a confirmed learning gap.
- Recommendations now use completed practice-answer topic aggregates only; formal exam outcomes remain separate.
- A topic recommendation requires both:
  - At least **5 answered questions**.
  - Accuracy below **60%**.
- Up to three eligible weak topics can produce focused practice recommendations, ordered by the existing weakest-topic ranking.
- When a topic has at least 3 incorrect answers, a separate mistake-review action is included.
- Priority is deterministic: below 40% accuracy or at least 10 answered questions is high; otherwise medium.
- Every evidence-backed recommendation returns answered count, incorrect count, accuracy, and the configured threshold values. The student dashboard displays that evidence.
- When no topic meets both thresholds, the system gives a low-priority baseline-building or diagnostic action instead of asserting that the weakest observed result is a reliable weakness.
- Added tests for low-sample suppression, minimum-sample weak-topic recommendations, evidence metadata, and mistake-review actions.

**Files changed**
- `api/src/analytics.ts`
- `api/tests/analytics.test.ts`
- `web/lib/api.ts`
- `web/app/analytics/page.tsx`

**Verification**
- These changes are pushed but have not yet been run in the user's environment.
- Existing user-confirmed 173/173 test results apply to the preceding commit, not this Phase 2 batch.
- The rules are transparent heuristics, not trained ML predictions and not claims of statistical significance.

**Next**
1. Run API/web tests, lint and production builds for this batch.
2. Fix any failures before expanding recommendation behavior.
3. Add safeguards against repeatedly recommending the same topic after recent practice, if the existing data can support this without introducing misleading recency assumptions.
4. Review recommendation interactions and responsive layout.


### Phase 2 cooldown and Phase 3 regression foundation — 2026-11-08

**Phase 2 correction**
- The 7-day recent-practice cooldown was already implemented in `getStudyRecommendations` in `api/src/analytics.ts`.
- Weak topics practiced within the cooldown are suppressed from revision prompts; when all qualifying topics are recent, the response explains why and suggests reviewing recent answers.
- Existing analytics tests move practice timestamps beyond the cooldown before asserting eligible recommendations. The cooldown logic is present in the current main branch; a dedicated within-window suppression assertion remains a useful coverage improvement.

**Phase 3 implementation started**
- Added `api/src/intelligence/linearRegression.ts`.
- Implemented multiple linear regression using standardized features and batch gradient descent.
- Added prediction with feature-schema validation.
- Added version-1 model artifact validation.
- Added evaluation metrics: MAE, RMSE and R-squared (null when target variance is zero).
- Added chronological train/test splitting so newer observations remain in the test set.
- Added tests for multi-feature fitting, constant features, prediction, metrics, malformed artifacts, invalid training data and chronological splits.

**Verification**
- GitHub Actions run [42506847582](https://github.com/smdgamekingindo-TN/ArcTester/actions/runs/42506847582) passed on commit `1886b0df55edae801ed02e01776da55d61ffb13c`.
- API/web tests, lint, Prisma generation, clean SQLite migration verification, API/web production builds and mobile typecheck all passed.
- This is the regression algorithm foundation, not a production score predictor yet. No student-data feature pipeline, baseline comparison, persistent model registry or prediction endpoint has been connected.

**Commits**
- `9978d62` — add TypeScript linear regression foundation.
- `5be2f71` — add regression training and evaluation tests.
- `1886b0d` — correct regression fixture expectation.
