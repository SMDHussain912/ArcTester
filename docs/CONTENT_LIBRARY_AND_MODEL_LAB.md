# ArcTester content library and model lab

## Study material publishing

Administrator workflow:

1. Open **Admin → Study materials**.
2. Enter a title, subject, optional topic and description.
3. Upload a PDF, TXT or Markdown file (maximum 8 MB).
4. The upload is saved as a private **DRAFT**.
5. Review the title and metadata, then select **Publish**.
6. Students find published files under **Student → Study materials**. Published PDFs can be previewed in a new browser tab or downloaded; TXT and Markdown files remain download-only.

Only authenticated administrators can upload, publish, archive or delete files. Students can list and download published materials only. Supported MIME types are application/pdf, text/plain, and text/markdown. Files are stored in the application database as base64 content; database persistence and backups are therefore required. The API verifies PDF signatures, checks stored byte length before serving, and sets X-Content-Type-Options: nosniff plus private no-store caching on file responses. Failed uploads keep the admin form populated so the file and metadata can be retried.

API:
- GET /admin/study-materials — administrator inventory.
- POST /admin/study-materials — upload a new draft with metadata and contentBase64.
- PATCH /admin/study-materials/:id — update metadata or status (DRAFT, PUBLISHED, ARCHIVED).
- DELETE /admin/study-materials/:id — permanently delete a file.
- GET /study-materials — student-visible published metadata.
- GET /study-materials/:id/download — download a published file.
- GET /study-materials/:id/preview — inline preview for published PDFs only.

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

For a first-time administrator, keep the default feature schema unchanged and upload a prepared JSON file. The raw schema and sample JSON editors are under **Advanced** disclosures. Choose **Train logistic baseline** for binary classification or multiple linear regression for regression; use **Queue TensorFlow.js** only as a separate neural-network experiment. Redundant KNN, decision-tree and Gaussian naive Bayes algorithms are retained only for historical artifact compatibility and are no longer trained as new candidates. Both paths create inactive candidates.

The Model Lab keeps model ID prefix and random seed as shared settings. Epochs and batch size are tucked under TensorFlow.js settings because they do not apply to classical baselines. TensorFlow.js queueing is disabled unless the selected dataset is a numeric-only regression dataset. The classification baseline trainer now fits only logistic regression; the regression baseline trainer fits multiple linear regression. KNN, decision-tree and Gaussian naive Bayes remain readable for historical artifact compatibility but are no longer generated as new candidates.\n\nThe personal next-attempt score predictor uses chronological walk-forward validation. It is shown only when it beats the mean baseline on **both MAE and RMSE**. MAE measures typical absolute error; RMSE penalizes larger misses more strongly. If either metric fails, ArcTester withholds the estimate rather than presenting a weaker model as an improvement.

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

## Model registry governance

- The first registered version is the bootstrap baseline. Later versions remain inactive until an administrator evaluates them against a different registered baseline.
- Evaluation datasets must be attested and must not be the training dataset of either the candidate or baseline model. This prevents direct train/evaluation reuse.
- A passing metric report alone is not enough for production activation: the evaluation must use a separate, attested `real-anonymized` dataset. Synthetic datasets remain useful for development and regression tests only.
- Activation and rollback are administrator-only operations and are written to the model registry audit log. Both endpoints accept an optional 10–500 character reason; the audit event stores the supplied reason or a clear administrator-action default. Only one version per model ID can be active at a time.
- Active versions cannot be deleted. Inactive versions can be deleted only when no training job for that model is queued or running.
- Before production use, verify the dataset consent/provenance, pseudonymous learner grouping, evaluation report, active version and audit history.

API:
- GET /admin/models — list model versions and production eligibility.
- POST /admin/models — register a version; later versions are inactive.
- POST /admin/models/:modelId/:version/evaluate — compare a candidate with a baseline on an independent registered dataset.
- POST /admin/models/:modelId/:version/activate — promote a candidate only after passing evaluation and production-data checks.
- POST /admin/models/:modelId/rollback — reactivate the previously activated version.
- GET /admin/models/:modelId/audit — inspect registry lifecycle events.
- GET /admin/models/:modelId/evaluations — inspect evaluation reports.
- DELETE /admin/models/:modelId/:version — delete an eligible inactive version.

API:
- POST /admin/model-datasets — register a dataset.
- GET /admin/model-datasets — list dataset metadata and fingerprints.
- POST /admin/model-datasets/:datasetId/tensorflow-jobs — queue TensorFlow.js training.
- GET /admin/model-training-jobs — list recent jobs and results.
- GET /admin/model-training-jobs/:jobId — inspect one job.
- POST /admin/model-datasets/:datasetId/train — train and rank classical ML candidates.

Training is performed by the API's background worker, not GitHub Actions. The Model Lab refreshes job information while the tab is open. The worker and database must remain running for queued jobs to progress. If the API host sleeps, restarts or loses its database volume, queued jobs may be delayed or lost depending on deployment persistence.
