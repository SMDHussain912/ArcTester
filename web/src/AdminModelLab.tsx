import { useState } from "react";

export type ModelLabDataset = { id: string; name: string; task: string; rowCount: number; targetColumn?: string; datasetKind?: string; featureSchema?: { name: string; type: string }[] };
export type ModelLabModel = { modelId: string; version: number; algorithm: string; task: string; dataset: string; isActive: boolean; productionEligible?: boolean | null; createdAt?: string };
export type ModelLabJob = {
  id: string;
  datasetId: string;
  modelId: string;
  status: string;
  progress: number;
  errorMessage: string;
  result?: unknown;
};
export type IntelligenceProviderStatus = { external: { provider: string; configured: boolean }; local: { provider: string; configured: boolean; baseUrl: string }; fallback: string[] };
export type ModelDatasetRegistration = {
  name: string;
  task: "regression" | "binary-classification";
  targetColumn: string;
  featureSchema: { name: string; type: "numeric" | "categorical"; categories?: string[] }[];
  samples: { features: Record<string, number | string>; target: number; groupId: string }[];
  sourceDescription: string;
  sourceAttested: true;
  datasetKind: "synthetic" | "real-anonymized";
};

// TensorFlow.js browser training requires a WebAssembly-capable runtime.
const tensorflowSupported = typeof WebAssembly !== "undefined" && typeof WebAssembly.instantiate === "function";

const DEFAULT_FEATURE_SCHEMA = [
  { name: "completed_attempts", type: "numeric" },
  { name: "previous_accuracy", type: "numeric" },
  { name: "recent_average_accuracy", type: "numeric" },
  { name: "overall_average_accuracy", type: "numeric" },
  { name: "previous_question_count", type: "numeric" },
];

type AdminModelLabProps = {
  datasets: ModelLabDataset[];
  jobs: ModelLabJob[];
  models: ModelLabModel[];
  selectedDatasetId: string;
  modelPrefix: string;
  busy: boolean;
  loading?: boolean;
  error?: string;
  intelligenceStatus?: IntelligenceProviderStatus | null;
  onDatasetChange: (id: string) => void;
  onModelPrefixChange: (prefix: string) => void;
  onQueueTraining: () => void;
  onTrainClassical: () => void;
  onRefresh: () => void;
  onRegisterDataset?: (payload: ModelDatasetRegistration) => void;
};

function validateDatasetRows(
  schema: ModelDatasetRegistration["featureSchema"],
  samples: ModelDatasetRegistration["samples"],
  task: ModelDatasetRegistration["task"],
) {
  if (!Array.isArray(schema) || schema.length === 0) throw new Error("Feature schema must be a non-empty JSON array.");
  const names = new Set<string>();
  for (const feature of schema) {
    if (!feature || typeof feature.name !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(feature.name)) {
      throw new Error("Every feature needs a valid name (letters, numbers and underscores; max 64 characters).");
    }
    if (names.has(feature.name)) throw new Error("Feature names must be unique: " + feature.name);
    names.add(feature.name);
    if (feature.type !== "numeric" && feature.type !== "categorical") throw new Error("Unsupported feature type for " + feature.name + ".");
    if (feature.type === "categorical" && (!Array.isArray(feature.categories) || feature.categories.length === 0 || feature.categories.some((value) => typeof value !== "string" || !value.trim()))) {
      throw new Error("Categorical feature " + feature.name + " needs a non-empty categories list.");
    }
  }
  if (!Array.isArray(samples) || samples.length < 30 || samples.length > 5000) {
    throw new Error("Samples must contain 30 to 5,000 rows.");
  }
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!sample || !sample.features || typeof sample.features !== "object" || Array.isArray(sample.features)) {
      throw new Error("Row " + (index + 1) + " must contain a features object.");
    }
    if (typeof sample.groupId !== "string" || !/^[a-f0-9]{64}$/.test(sample.groupId)) {
      throw new Error("Row " + (index + 1) + " needs a 64-character lowercase hexadecimal groupId.");
    }
    if (typeof sample.target !== "number" || !Number.isFinite(sample.target)) {
      throw new Error("Row " + (index + 1) + " has a missing or non-finite target value.");
    }
    if (task === "binary-classification" && sample.target !== 0 && sample.target !== 1) {
      throw new Error("Binary-classification targets must be exactly 0 or 1 (row " + (index + 1) + ").");
    }
    for (const feature of schema) {
      const value = sample.features[feature.name];
      if (feature.type === "numeric" && (typeof value !== "number" || !Number.isFinite(value))) {
        throw new Error("Row " + (index + 1) + " has a missing or invalid numeric value for " + feature.name + ".");
      }
      if (feature.type === "categorical" && (typeof value !== "string" || !feature.categories?.includes(value))) {
        throw new Error("Row " + (index + 1) + " has an unknown category for " + feature.name + ".");
      }
    }
  }
}

export default function AdminModelLab({
  datasets, jobs, models, selectedDatasetId, modelPrefix, busy, loading = false, intelligenceStatus = null, onDatasetChange,
  onModelPrefixChange, onQueueTraining, onTrainClassical, onRefresh, onRegisterDataset,
}: AdminModelLabProps) {
  const [datasetName, setDatasetName] = useState("");
  const [targetColumn, setTargetColumn] = useState("next_score");
  const [task, setTask] = useState<"regression" | "binary-classification">("regression");
  const [datasetKind, setDatasetKind] = useState<"synthetic" | "real-anonymized">("synthetic");
  const [sourceDescription, setSourceDescription] = useState("");
  const [sourceAttested, setSourceAttested] = useState(false);
  const [featureSchemaText, setFeatureSchemaText] = useState(JSON.stringify(DEFAULT_FEATURE_SCHEMA, null, 2));
  const [samplesText, setSamplesText] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [formError, setFormError] = useState("");

  async function readDatasetFile(file: File) {
    setFormError("");
    setUploadName(file.name);
    setSamplesText("");
    try {
      if (!file.name.toLowerCase().endsWith(".json") || (file.type && file.type !== "application/json")) {
        throw new Error("Choose a JSON dataset file.");
      }
      if (file.size < 1 || file.size > 8 * 1024 * 1024) {
        throw new Error("Dataset files must be between 1 byte and 8 MB.");
      }
      const parsed: unknown = JSON.parse(await file.text());
      const samples = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && "samples" in parsed
          ? (parsed as { samples: unknown }).samples
          : null;
      if (!Array.isArray(samples)) throw new Error("JSON must contain an array of samples or a samples property.");
      setSamplesText(JSON.stringify(samples, null, 2));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not read this JSON file.");
    }
  }

  function downloadSampleTemplate() {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      features: {
        completed_attempts: 3 + index,
        previous_accuracy: 0.45 + (index % 10) / 20,
        recent_average_accuracy: 0.5 + (index % 8) / 20,
        overall_average_accuracy: 0.48 + (index % 9) / 20,
        previous_question_count: 20,
      },
      target: task === "binary-classification" ? index % 2 : Math.min(1, 0.5 + (index % 10) / 20),
      groupId: (index + 1).toString(16).padStart(64, "0"),
    }));
    const blob = new Blob([JSON.stringify({ samples: rows }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "arctester-training-dataset-template.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function submitDataset() {
    setFormError("");
    try {
      const featureSchema = JSON.parse(featureSchemaText) as ModelDatasetRegistration["featureSchema"];
      const samples = JSON.parse(samplesText) as ModelDatasetRegistration["samples"];
      if (!datasetName.trim()) throw new Error("Enter a dataset name.");
      if (!sourceDescription.trim() || sourceDescription.trim().length < 10) throw new Error("Provide at least 10 characters describing the dataset source.");
      if (!sourceAttested) throw new Error("Confirm that you are authorized to use this dataset and that it contains no direct personal identifiers.");
      validateDatasetRows(featureSchema, samples, task);
      if (!targetColumn.trim() || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(targetColumn.trim())) throw new Error("Target column must be a valid identifier.");
      if (datasetKind === "real-anonymized" && !sourceDescription.toLowerCase().includes("anonym")) throw new Error("Describe the anonymization process in the source description for real learner data.");
      if (!onRegisterDataset) throw new Error("Dataset registration is not connected to the API.");
      onRegisterDataset({
        name: datasetName.trim(),
        task,
        targetColumn: targetColumn.trim(),
        featureSchema,
        samples,
        sourceDescription: sourceDescription.trim(),
        sourceAttested: true,
        datasetKind,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Dataset registration data is invalid.");
    }
  }

  return (
    <div className="admin-model-lab stack">
      <div className="admin-page-title">
        <div><p className="eyebrow">MODEL OPERATIONS</p><h1>Model lab</h1><p>Register datasets, train candidate models and inspect their evaluation evidence before activation.</p></div>
        <button className="ghost" onClick={onRefresh} disabled={busy}>Refresh</button>
      </div>

      <section className="model-intelligence-overview">
        <div className="model-intelligence-heading">
          <div><p className="eyebrow">ARCTESTER INTELLIGENCE STACK</p><h2>Model ecosystem</h2><p>Train specialist models, compare evidence, then use the decision layer to choose safe study actions.</p></div>
          <div className="model-count-badge"><strong>6</strong><span>available algorithms</span><small>{models.length} trained candidates registered</small></div>
        </div>
        <div className="model-catalog-grid">
          <article className="model-catalog-card"><span className="model-catalog-icon">01</span><div><strong>Multiple linear regression</strong><p>Predicts continuous scores and readiness trends.</p><small>REGRESSION · IMPLEMENTED</small></div></article>
          <article className="model-catalog-card"><span className="model-catalog-icon">02</span><div><strong>Logistic regression</strong><p>Estimates binary outcome probabilities.</p><small>CLASSIFICATION · IMPLEMENTED</small></div></article>
          <article className="model-catalog-card"><span className="model-catalog-icon">03</span><div><strong>K-nearest neighbours</strong><p>Compares learners or samples with similar feature patterns.</p><small>CLASSIFICATION · IMPLEMENTED</small></div></article>
          <article className="model-catalog-card"><span className="model-catalog-icon">04</span><div><strong>Decision tree</strong><p>Produces interpretable rule paths for binary predictions.</p><small>CLASSIFICATION · IMPLEMENTED</small></div></article>
          <article className="model-catalog-card"><span className="model-catalog-icon">05</span><div><strong>Gaussian Naive Bayes</strong><p>Probabilistic baseline for numeric classification features.</p><small>CLASSIFICATION · IMPLEMENTED</small></div></article>
          <article className="model-catalog-card model-catalog-card-accent"><span className="model-catalog-icon">06</span><div><strong>TensorFlow.js neural regressor</strong><p>Trainable neural network for numeric score prediction.</p><small>NEURAL NETWORK · IMPLEMENTED</small></div></article>
        </div>
        <div className="decision-engine-panel">
          <div className="decision-engine-top"><div><p className="eyebrow">HYBRID DECISION LAYER</p><h3>ArcTester Decision Engine</h3><p>Turns verified learner evidence into explainable next-step recommendations.</p></div><span className="decision-engine-status">ACTIVE · RULE-BASED</span></div>
          <div className="decision-engine-flow">
            <div><strong>01 · Evidence</strong><span>Attempts, answers, topic accuracy and recency</span></div>
            <i>→</i>
            <div><strong>02 · Intelligence</strong><span>Validated score prediction + evidence rules</span></div>
            <i>→</i>
            <div><strong>03 · Decision</strong><span>Prioritised practice, revision or review actions</span></div>
          </div>
          <div className="decision-engine-guardrails"><span>✓ Minimum evidence thresholds</span><span>✓ Confidence and baseline checks</span><span>✓ Explainable reasons</span><span>✓ Human-controlled model activation</span></div>
          <p className="decision-engine-note">Decision-making is currently handled by the live evidence-based recommendation policy and score predictor—not by a separately trained decision model. Candidate ML models remain inactive until validated. They never autonomously change exam settings, grades or student access.</p>
          <div className="answer-intelligence-admin">
            <div><p className="eyebrow">ANSWER INTELLIGENCE · HYBRID ROUTING</p><h3>Explanation providers</h3><p>External AI → local model → question-bank explanation → deterministic offline guide.</p></div>
            <div className="intelligence-provider-grid">
              <article><strong>External provider</strong><span className={intelligenceStatus?.external.configured?"status status-used":"status status-pending"}>{intelligenceStatus?.external.configured?intelligenceStatus.external.provider+" configured":"Not configured"}</span></article>
              <article><strong>Local model</strong><span className={intelligenceStatus?.local.configured?"status status-used":"status status-pending"}>{intelligenceStatus?.local.configured?intelligenceStatus.local.provider+" configured":"Not configured"}</span></article>
              <article><strong>Offline fallback</strong><span className="status status-used">Always available</span></article>
            </div>
            <small className="muted">Provider credentials are configured as API environment variables and are never exposed in this dashboard. AI explanations are labelled unverified until reviewed.</small>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">STEP 1 · DATA</p><h2>Register training dataset</h2></div></div>
        <p className="muted">Upload a JSON sample array prepared using the dataset guide. Files are checked before parsing; registration stores the declared features, targets, provenance and dataset fingerprint. It does not start training.</p>
        <div className="admin-two-col">
          <label>Dataset name<input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} placeholder="ECET learner score history" /></label>
          <label>Target column<input value={targetColumn} onChange={(event) => setTargetColumn(event.target.value)} /></label>
          <label>Prediction task<select value={task} onChange={(event) => setTask(event.target.value as typeof task)}><option value="regression">Regression</option><option value="binary-classification">Binary classification</option></select></label>
          <label>Dataset provenance<select value={datasetKind} onChange={(event) => setDatasetKind(event.target.value as typeof datasetKind)}><option value="synthetic">Synthetic / experiment only</option><option value="real-anonymized">Real anonymized learner data</option></select></label>
        </div>
        <label>Source description<textarea value={sourceDescription} onChange={(event) => setSourceDescription(event.target.value)} placeholder="Describe where the data came from, how it was collected and why its use is authorized." /></label>
        <label className="dataset-attestation"><input type="checkbox" checked={sourceAttested} onChange={(event) => setSourceAttested(event.target.checked)} /> I confirm I am authorized to use this data and have removed direct personal identifiers.</label>
        <label>Feature schema JSON<textarea rows={7} spellCheck={false} value={featureSchemaText} onChange={(event) => setFeatureSchemaText(event.target.value)} /></label>
        <label className="dataset-upload-row"><div><strong>Training samples JSON</strong><small>Choose a .json file · 30–5,000 sample rows · maximum 8 MB</small></div><input aria-label="Training samples JSON file" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readDatasetFile(file); }} /></label><button type="button" className="button button-secondary" onClick={downloadSampleTemplate}>Download sample JSON template (synthetic)</button>
        {uploadName && <p className="muted">Selected file: {uploadName}</p>}
        <label>Samples preview / JSON<textarea rows={10} spellCheck={false} value={samplesText} onChange={(event) => setSamplesText(event.target.value)} placeholder='[{"features":{"completed_attempts":12,"previous_accuracy":0.65,"recent_average_accuracy":0.7,"overall_average_accuracy":0.66,"previous_question_count":20},"target":0.72,"groupId":"64-character-keyed-hmac"}]' /></label>
        {formError && <p className="error" role="alert">{formError}</p>}
        <div className="editor-actions"><button className="primary" disabled={busy || !onRegisterDataset} onClick={submitDataset}>Validate and register dataset</button></div>
        <p className="muted">Real learner data must be authorized and pseudonymized. Never upload names, emails, raw student IDs or secrets. Synthetic datasets can be used for experiments but must never qualify a production model.</p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">STEP 2 · TRAIN</p><h2>Train a candidate model</h2></div></div>
        <label>Training model prefix<input value={modelPrefix} onChange={(event) => onModelPrefixChange(event.target.value)} /></label>
        <label>Dataset<select value={selectedDatasetId} onChange={(event) => onDatasetChange(event.target.value)}><option value="">Select dataset</option>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.rowCount} rows · {dataset.datasetKind ?? dataset.task}</option>)}</select></label>
        <div className="row wrap"><button className="primary" disabled={!selectedDatasetId || busy || !tensorflowSupported} onClick={onQueueTraining}>Queue TensorFlow.js</button><button className="button button-secondary" disabled={!selectedDatasetId || busy} onClick={onTrainClassical}>Train classical ML candidates</button></div><p className="muted">TensorFlow.js requires regression data with numeric features. Classical training supports regression and binary classification. Synthetic data can test the pipeline but cannot qualify a production model.</p>
        {loading ? <div className="model-lab-loading" role="status" aria-label="Loading model datasets"><div className="skeleton skeleton-table-row" /><div className="skeleton skeleton-table-row" /></div> : datasets.length === 0 && <p className="muted">No registered datasets yet. Register a dataset above first.</p>}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">MODEL REGISTRY</p><h2>Candidate models ({models.length})</h2></div></div>
        {loading ? <div className="model-lab-loading" role="status" aria-label="Loading model registry"><div className="skeleton skeleton-table-row" /><div className="skeleton skeleton-table-row" /></div> : models.length === 0 ? <p className="muted">No model candidates have been registered yet.</p> : <div className="model-registry-list">
          {models.map((model) => <article className="model-registry-row" key={model.modelId + "-" + model.version}>
            <div><strong>{model.modelId} · v{model.version}</strong><p className="muted">{model.algorithm} · {model.task} · Dataset: {model.dataset}</p></div>
            <div className="row wrap"><span className={"status " + (model.isActive ? "status-used" : "status-pending")}>{model.isActive ? "ACTIVE" : "CANDIDATE"}</span>{model.productionEligible === true ? <span className="status status-used">PRODUCTION ELIGIBLE</span> : model.productionEligible === false ? <span className="status status-expired">NOT ELIGIBLE</span> : null}</div>
          </article>)}
        </div>}
        <p className="muted">Candidates stay inactive until separately evaluated and approved. Synthetic-data models are never production eligible.</p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">STEP 3 · OBSERVE</p><h2>Training jobs and evaluation</h2></div></div>
        {loading ? <div className="model-lab-loading" role="status" aria-label="Loading training jobs"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div> : jobs.length === 0 ? <p className="muted">No training jobs yet.</p> : jobs.map((job) => (
          <article key={job.id} className="question-review-row">
            <div className="panel-header"><strong>{job.modelId}</strong><span className={job.status === "SUCCEEDED" ? "status status-used" : job.status === "FAILED" ? "status status-expired" : "status status-pending"}>{job.status}</span></div>
            <p className="muted">Job {job.id} · Dataset {job.datasetId}</p>
            <div className="training-progress" role="progressbar" aria-label={job.modelId + " training progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, job.progress))}><span style={{ width: Math.max(0, Math.min(100, job.progress)) + "%" }} /></div>
            <p>{job.progress}% complete</p>
            {job.errorMessage && <p className="error" role="alert">{job.errorMessage}</p>}
            {job.result !== undefined && job.result !== null && (() => {
              const result = job.result as { productionEligible?: boolean; split?: { trainRows?: number; testRows?: number; trainGroups?: number; testGroups?: number }; candidate?: { mae?: number; rmse?: number; rSquared?: number | null }; baseline?: { mae?: number; rmse?: number; rSquared?: number | null }; reason?: string };
              const metric = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "—";
              return <div className="training-evaluation">
                <div className="training-evaluation-status"><strong>{result.productionEligible ? "Candidate passed baseline gate" : "Not eligible for production"}</strong><span className={result.productionEligible ? "status status-used" : "status status-expired"}>{result.productionEligible ? "ELIGIBLE" : "NOT ELIGIBLE"}</span></div>
                {result.split && <p className="muted">Training: {result.split.trainRows ?? "—"} rows · Holdout: {result.split.testRows ?? "—"} rows · Learner groups: {result.split.trainGroups ?? "—"} train / {result.split.testGroups ?? "—"} holdout</p>}
                {result.candidate && result.baseline && <div className="training-metric-grid">
                  <div><small>Candidate MAE</small><strong>{metric(result.candidate.mae)}</strong></div>
                  <div><small>Baseline MAE</small><strong>{metric(result.baseline.mae)}</strong></div>
                  <div><small>Candidate RMSE</small><strong>{metric(result.candidate.rmse)}</strong></div>
                  <div><small>Baseline RMSE</small><strong>{metric(result.baseline.rmse)}</strong></div>
                </div>}
                {result.reason && <p className="muted">{result.reason}</p>}
                <details><summary>Raw training report</summary><pre className="model-result-json">{JSON.stringify(job.result, null, 2)}</pre></details>
              </div>;
            })()}
          </article>
        ))}
        <p className="muted">A completed job is not automatically a production model. Review holdout metrics, baseline comparison, sample counts, learner-group split and eligibility before activating a candidate in the model registry.</p>
      </section>
    </div>
  );
}
