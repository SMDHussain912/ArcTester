# Preparing an ArcTester TensorFlow.js dataset

The admin Model Intelligence page currently accepts **JSON samples**, not a raw CSV upload. Keep the source CSV on your own computer and convert it locally with `scripts/prepare_tensorflow_dataset.py`.

## 1. CSV input format

One row represents one learner's historical state before a later assessment. You can include multiple rows per learner, but keep the same `student_id` for that learner in every row. Do not send the input CSV to ArcTester.

Required header:

```csv
student_id,completed_attempts,previous_accuracy,recent_average_accuracy,overall_average_accuracy,previous_question_count,next_score
learner-001,12,0.65,0.70,0.66,20,0.72
learner-001,13,0.72,0.74,0.67,20,0.75
learner-002,8,0.55,0.60,0.58,25,0.62
```

- `student_id`: local-only grouping value; never upload it.
- `completed_attempts`: integer, at least 3.
- `previous_question_count`: positive integer.
- Accuracy values and `next_score`: fractions from 0 to 1. Use `0.75`, not `75`.
- `next_score`: the actual accuracy/score fraction from the next completed assessment corresponding to that row's features. Do not use a future result as an input feature.
- For the production student population model, the feature names and order are exactly the five names above.

The sample rows above are format examples only, not real training data. They are not sufficient to train a model.

## 2. Generate keyed learner pseudonyms locally

Use a random secret of at least 32 bytes and keep it outside the repository, CSV, JSON, and database. Example on Linux:

```bash
export ARCTESTER_GROUP_HMAC_SECRET="$(openssl rand -hex 32)"
python3 scripts/prepare_tensorflow_dataset.py private-learners.csv tensorflow-samples.json
```

Keep the generated secret safe and reuse the same secret for future datasets if you need stable pseudonyms. Losing or rotating it changes every group ID. Never commit the secret or paste it into ChatGPT.

The script writes only `features`, `target`, and a keyed HMAC-SHA256 `groupId`. It validates the counts, accuracy ranges, minimum 30 rows and minimum 5 distinct learner groups. It does not write raw IDs.

## 3. Register and train in ArcTester

1. Sign in using an administrator account.
2. Open **Admin → Model Intelligence** (`/admin/models`).
3. Set a dataset name, target column `next_score`, provenance, and a truthful source description.
4. Keep the five-feature schema shown by default.
5. Open `tensorflow-samples.json` and paste its complete array into **Samples JSON**.
6. Select **Real anonymized learner data** only if the data is genuinely authorized and anonymized. Otherwise select Synthetic / experiment only.
7. Confirm the attestation and register the dataset.
8. Select **Train candidate**. Inspect the held-out MAE/RMSE against the linear-regression baseline and the number of train/holdout learner groups.

Training requires at least 30 rows, at least 5 unique learner groups, and at least 20 held-out rows. The split is by learner group, so one learner cannot appear in both training and evaluation. A TensorFlow candidate is saved only if it beats or ties the baseline on both MAE and RMSE.

## 4. Activation rules

Training does not activate a model. Synthetic data can never qualify for production. A real-anonymized candidate must also pass the held-out sample and baseline checks before an administrator can activate it. Do not claim a model is useful merely because training completed.

## Privacy and data quality

- Obtain permission and use only data you are authorized to process.
- Remove names, emails, phone numbers, database IDs, and other direct identifiers before upload.
- Keep the raw CSV and HMAC secret local.
- Do not use plain SHA-256 of student IDs; predictable IDs can be guessed.
- Each row must describe features available **before** the target assessment. Avoid target leakage.
- If the dataset has too few distinct learners or held-out rows, collect more valid data rather than weakening the split.
