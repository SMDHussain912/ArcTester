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
