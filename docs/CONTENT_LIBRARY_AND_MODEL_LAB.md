# ArcTester content library and model lab

## Study material publishing

Administrator workflow:

1. Open **Admin → Study materials**.
2. Enter a title, subject, optional topic and description.
3. Upload a PDF, TXT or Markdown file (maximum 8 MB).
4. The upload is saved as a private **DRAFT**.
5. Review the title and metadata, then select **Publish**.
6. Students find published files under **Student → Study materials** and can download them.

Only authenticated administrators can upload, publish, archive or delete files. Students can list and download published materials only. Supported MIME types are application/pdf, text/plain, and text/markdown. Files are stored in the application database as base64 content; database persistence and backups are therefore required. The API verifies PDF signatures and sets X-Content-Type-Options: nosniff on downloads.

API:
- GET /admin/study-materials — administrator inventory.
- POST /admin/study-materials — upload a new draft with metadata and contentBase64.
- PATCH /admin/study-materials/:id — update metadata or status (DRAFT, PUBLISHED, ARCHIVED).
- DELETE /admin/study-materials/:id — permanently delete a file.
- GET /study-materials — student-visible published metadata.
- GET /study-materials/:id/download — download a published file.

## Training dataset upload

Administrator workflow:

1. Open **Admin → Model lab**.
2. Use **Download sample JSON template (synthetic)** to get a correctly shaped 100-row example dataset.
3. Edit the feature schema and sample records, or upload your own JSON file with a top-level samples array.
4. Set a dataset name, target column, task, provenance type and source description.
5. Confirm the data-use and privacy attestation.
6. Select **Validate and register dataset**. This stores an immutable dataset version and SHA-256 fingerprint; it does not train anything yet.
7. Select the registered dataset under **Train a candidate model**.
8. Use **Queue TensorFlow.js training** for numeric regression datasets, or **Train classical ML candidates** for regression and binary classification.
9. Monitor the TensorFlow job's state, percentage, errors, training/holdout counts and candidate-versus-baseline MAE/RMSE. Classical training returns a ranked candidate summary immediately.
10. Candidates are not automatically promoted. Review evaluation evidence and use the model governance controls separately.

Each sample has this structure:

~~~json
{
  "features": {
    "completed_attempts": 12,
    "previous_accuracy": 0.65,
    "recent_average_accuracy": 0.7,
    "overall_average_accuracy": 0.66,
    "previous_question_count": 20
  },
  "target": 0.72,
  "groupId": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
~~~

- A dataset contains 30–5,000 rows for training; the sample template provides 100 rows to satisfy the minimum grouped holdout size.
- Each row must have exactly the declared feature keys and a finite numeric target.
- TensorFlow.js currently requires regression, numeric-only features, and a 64-character lowercase hexadecimal groupId on every row.
- Classical training supports regression and binary classification. Classification targets must be 0 or 1 and the dataset must contain both classes.
- For real learner data, groupId must be a keyed HMAC-SHA-256 pseudonym so one learner's records cannot leak across train and holdout groups. Never use names, emails, raw student IDs or passwords.
- Synthetic data is for pipeline experiments only. It cannot qualify a model for production.
- The server performs the actual schema, row, group and task validation. A browser-side preview is not proof of model quality.

API:
- POST /admin/model-datasets — register a dataset.
- GET /admin/model-datasets — list dataset metadata and fingerprints.
- POST /admin/model-datasets/:datasetId/tensorflow-jobs — queue TensorFlow.js training.
- GET /admin/model-training-jobs — list recent jobs and results.
- GET /admin/model-training-jobs/:jobId — inspect one job.
- POST /admin/model-datasets/:datasetId/train — train and rank classical ML candidates.

Training is performed by the API's background worker, not GitHub Actions. The Model Lab refreshes job information while the tab is open. The worker and database must remain running for queued jobs to progress. If the API host sleeps, restarts or loses its database volume, queued jobs may be delayed or lost depending on deployment persistence.
