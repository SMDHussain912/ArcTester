# ArcTester Dataset Factory

ArcTester includes a deterministic synthetic-data generator for developing and testing the intelligence pipeline.

## Dataset types

The factory currently generates five separate CSV datasets:

| File | Intended experiment | Target / label |
|---|---|---|
| `student-performance.csv` | Student-level performance patterns | Formal score threshold (60%) |
| `topic-mastery.csv` | Topic-level practice accuracy | Mastery indicator (minimum 10 attempts and 80% accuracy) |
| `exam-readiness.csv` | Readiness feature pipeline | Formal score threshold (60%) |
| `learning-behaviour.csv` | Study consistency and engagement | Simulated engagement indicator |
| `score-prediction.csv` | Next-attempt score regression | Next-attempt accuracy |

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
