import { useEffect, useState } from "react";

export type ModelLabDataset = { id: string; name: string; task: string; rowCount: number; targetColumn?: string; sourceDescription?: string; datasetKind?: string; featureSchema?: { name: string; type: string }[] };
export type ModelLabModel = { modelId: string; version: number; algorithm: string; task: string; dataset: string; isActive: boolean; productionEligible?: boolean | null; createdAt?: string };
export type ModelLabJob = {
  id: string;
  datasetId: string;
  modelId: string;
  status: string;
  progress: number;
  errorMessage: string;
  result?: unknown;
  liveMetrics?: {epoch:number;totalEpochs:number;loss:number|null;mae:number|null;updatedAt:string}|null;
};
type EpochPoint = {epoch:number;loss:number|null;mae:number|null};
function TrainingMetricChart({title,points,metric,totalEpochs}:{title:string;points:EpochPoint[];metric:"loss"|"mae";totalEpochs:number}) {
  const values=points.map(point=>point[metric]).filter((value):value is number=>typeof value==="number"&&Number.isFinite(value));
  if(values.length===0)return <div className="training-chart-empty">Waiting for first epoch metrics…</div>;
  const min=Math.min(...values),max=Math.max(...values),range=max-min||1;
  const coords=points.map((point,index)=>({x:12+(index/Math.max(points.length-1,1))*276,y:88-(((point[metric]??min)-min)/range)*72,value:point[metric]})).filter(point=>point.value!==null);
  const polyline=coords.map(point=>`${point.x},${point.y}`).join(" ");
  const latest=values[values.length-1];
  return <div className="training-chart"><div className="training-chart-head"><strong>{title}</strong><span>{latest.toFixed(5)}</span></div><svg viewBox="0 0 300 112" role="img" aria-label={title+" over training epochs"}><line x1="12" y1="88" x2="288" y2="88" className="training-chart-axis"/><line x1="12" y1="16" x2="12" y2="88" className="training-chart-axis"/><polyline points={polyline} className="training-chart-line"/>{coords.length>0&&<circle cx={coords[coords.length-1].x} cy={coords[coords.length-1].y} r="3.5" className="training-chart-point"/>}</svg><div className="training-chart-foot"><span>Epoch {points[0]?.epoch??"—"}</span><span>{points[points.length-1]?.epoch??"—"} / {totalEpochs}</span></div></div>;
}

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

const DEFAULT_FEATURE_SCHEMA = [
  { name: "completed_attempts", type: "numeric" },
  { name: "previous_accuracy", type: "numeric" },
  { name: "recent_average_accuracy", type: "numeric" },
  { name: "overall_average_accuracy", type: "numeric" },
  { name: "previous_question_count", type: "numeric" },
];

const LEGACY_BASELINE_ALGORITHMS = new Set(["knn", "decision-tree", "gaussian-naive-bayes"]);

const APPROVED_MODEL_PORTFOLIO = [
  { id: "performance-gradient-boosting", name: "Gradient Boosting", purpose: "Next-attempt performance prediction", inputs: "Point-in-time attempt history and subject/topic mastery", outputs: "Predicted accuracy, interval and local explanation factors", gate: "500+ examples · 50+ learner groups · beat MAE and RMSE baselines" },
  { id: "performance-random-forest", name: "Random Forest", purpose: "Performance prediction and feature importance", inputs: "Same versioned performance features and splits as Gradient Boosting", outputs: "Predicted accuracy, interval and stable global feature importance", gate: "Paired holdout comparison · stable importance across folds" },
  { id: "exam-readiness-classifier", name: "Readiness Classifier", purpose: "Classify exam readiness", inputs: "Recent practice, subject coverage and prior full mock history", outputs: "Not ready / Developing / Ready probabilities", gate: "1,000+ labeled snapshots · 100+ learner groups · calibrated false-READY rate" },
  { id: "adaptive-question-selector", name: "Adaptive Learning", purpose: "Personalized next-question ranking", inputs: "Learner mastery state, eligible questions and session constraints", outputs: "Ranked question IDs with reason codes", gate: "10,000+ logged decisions · 200+ learner groups · offline policy evaluation" },
  { id: "question-semantic-embeddings", name: "Question Embeddings", purpose: "Semantic search and question relationships", inputs: "Approved question stem and subject/topic context", outputs: "384-dimensional vectors and ranked semantic matches", gate: "Human-reviewed pairs · retrieval quality and latency benchmarks" },
  { id: "exam-session-anomaly", name: "Exam Anomaly Detection", purpose: "Flag unusual exam sessions for human review", inputs: "Server-observed session event aggregates and telemetry coverage", outputs: "Anomaly score, severity and evidence reason codes", gate: "2,000+ sessions · 200+ learner groups · reviewed false-positive rate" },
] as const;

type ModelAuditEvent = {id:string;actorId:number|null;modelId:string;version:number;action:string;details:Record<string,unknown>;createdAt:string};
type ModelEvaluation = {id:string;actorId:number|null;modelId:string;candidateVersion:number;baselineVersion:number;evaluationDataset:string;datasetFingerprint:string;sampleCount:number;metrics:Record<string,unknown>;status:string;evaluatedAt:string};

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
  onQueueTraining: (options: {seed:number;epochs:number;batchSize:number}) => void;
  onTrainClassical: (seed:number) => void;
  onRefresh: () => void;
  onRegisterDataset?: (payload: ModelDatasetRegistration) => void;
  onCancelJob?: (jobId: string) => void;
  onEvaluateModel?: (modelId: string, version: number, baselineVersion: number, datasetId: string) => void;
  onEditDataset?: (id:string, values:{name:string;sourceDescription:string})=>void;
  onDeleteDataset?: (id:string)=>void;
  onDeleteModel?: (modelId:string,version:number)=>void;
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

function getDatasetPreviewSummary(raw: string): { rows: number; features: number } | { error: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    const samples = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && "samples" in parsed
        ? (parsed as { samples: unknown }).samples
        : null;
    if (!Array.isArray(samples)) return { error: "JSON must contain a sample array." };
    const first = samples[0] as { features?: unknown } | undefined;
    const features = first?.features && typeof first.features === "object" && !Array.isArray(first.features)
      ? Object.keys(first.features).length
      : 0;
    return { rows: samples.length, features };
  } catch {
    return { error: "The sample JSON has a syntax error. Fix it before registration." };
  }
}

export default function AdminModelLab({
  datasets, jobs, models, selectedDatasetId, modelPrefix, busy, loading = false, intelligenceStatus = null, onDatasetChange,
  onModelPrefixChange, onQueueTraining, onTrainClassical, onRefresh, onRegisterDataset, onCancelJob, onEvaluateModel, onEditDataset, onDeleteDataset, onDeleteModel,
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
  const [modelSearch,setModelSearch]=useState("");
  const [algorithmFilter,setAlgorithmFilter]=useState("all");
  const [testModelId,setTestModelId]=useState("");
  const [testFeatures,setTestFeatures]=useState<Record<string,string>>({});
  const [testResult,setTestResult]=useState<unknown>(null);
  const [testError,setTestError]=useState("");
  const [actionBusy,setActionBusy]=useState(false);
  const [seed,setSeed]=useState("42");
  const [epochs,setEpochs]=useState("80");
  const [batchSize,setBatchSize]=useState("32");
  const [editingDatasetId,setEditingDatasetId]=useState("");
  const [editingDatasetName,setEditingDatasetName]=useState("");
  const [editingDatasetSource,setEditingDatasetSource]=useState("");
  const [historyModelId,setHistoryModelId]=useState("");
  const [auditEvents,setAuditEvents]=useState<ModelAuditEvent[]>([]);
  const [evaluationHistory,setEvaluationHistory]=useState<ModelEvaluation[]>([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState("");
  const [epochHistory,setEpochHistory]=useState<Record<string,EpochPoint[]>>({});
  useEffect(()=>{setEpochHistory(current=>{let changed=false;const next={...current};for(const job of jobs){const sample=job.liveMetrics;if(!sample||!Number.isFinite(sample.epoch))continue;const points=next[job.id]??[];if(points.some(point=>point.epoch===sample.epoch))continue;next[job.id]=[...points,{epoch:sample.epoch,loss:sample.loss,mae:sample.mae}].slice(-500);changed=true;}return changed?next:current;});},[jobs]);

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

  const samplePreview = samplesText.trim() ? getDatasetPreviewSummary(samplesText) : null;
  const totalDatasetRows = datasets.reduce((total, dataset) => total + dataset.rowCount, 0);
  const activeJobs = jobs.filter((job) => job.status === "QUEUED" || job.status === "RUNNING").length;
  const completedJobs = jobs.filter((job) => job.status === "SUCCEEDED").length;
  const failedJobs = jobs.filter((job) => job.status === "FAILED" || job.status === "CANCELLED").length;
  const activeModels = models.filter((model) => model.isActive).length;
  const algorithms=Array.from(new Set(models.map(model=>model.algorithm))).sort();
  const visibleModels=models.filter(model=>(algorithmFilter==="all"||model.algorithm===algorithmFilter)&&`${model.modelId} ${model.algorithm} ${model.dataset}`.toLowerCase().includes(modelSearch.toLowerCase()));
  const selectedTestModel=models.find(model=>model.modelId===testModelId&&model.isActive);
  const testSchema=datasets.find(dataset=>dataset.name===selectedTestModel?.dataset)?.featureSchema??DEFAULT_FEATURE_SCHEMA;

  async function loadModelHistory(modelId:string) {
    setHistoryModelId(modelId);setHistoryLoading(true);setHistoryError("");setAuditEvents([]);setEvaluationHistory([]);
    try {
      const base=(import.meta.env.VITE_API_URL||"https://arctester.onrender.com").replace(/\/+$/,"");
      const [auditResponse,evaluationResponse]=await Promise.all([
        fetch(base+`/admin/models/${encodeURIComponent(modelId)}/audit`,{credentials:"include"}),
        fetch(base+`/admin/models/${encodeURIComponent(modelId)}/evaluations`,{credentials:"include"}),
      ]);
      const [auditBody,evaluationBody]=await Promise.all([auditResponse.json().catch(()=>({})),evaluationResponse.json().catch(()=>({}))]);
      if(!auditResponse.ok)throw new Error(auditBody.error||"Could not load model audit history.");
      if(!evaluationResponse.ok)throw new Error(evaluationBody.error||"Could not load evaluation history.");
      setAuditEvents(Array.isArray(auditBody.events)?auditBody.events:[]);
      setEvaluationHistory(Array.isArray(evaluationBody.evaluations)?evaluationBody.evaluations:[]);
    } catch(error) {setHistoryError(error instanceof Error?error.message:"Could not load model history.");}
    finally {setHistoryLoading(false);}
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



      <section className="model-lab-health-grid" aria-label="Model Lab summary">
        <article><span>Registered datasets</span><strong>{datasets.length}</strong><small>{totalDatasetRows.toLocaleString()} total samples</small></article>
        <article><span>Training in progress</span><strong>{activeJobs}</strong><small>{jobs.filter((job) => job.status === "QUEUED").length} queued · {jobs.filter((job) => job.status === "RUNNING").length} running</small></article>
        <article><span>Completed jobs</span><strong>{completedJobs}</strong><small>{failedJobs} failed or cancelled</small></article>
        <article><span>Active models</span><strong>{activeModels}</strong><small>{models.length - activeModels} inactive candidates</small></article>
      </section>

      <section className="admin-panel" aria-labelledby="approved-model-portfolio-title">
        <div className="admin-panel-head"><div><p className="eyebrow">INTELLIGENCE ROADMAP</p><h2 id="approved-model-portfolio-title">Approved model portfolio</h2></div><span className="status status-pending">6 planned · 0 newly implemented</span></div>
        <p className="muted">These six model capabilities are approved architecture targets, not trained or production-active models. Each has its own dataset contract and qualification gate. Existing registry entries below remain separate legacy/baseline artifacts.</p>
        <div className="model-registry-list">
          {APPROVED_MODEL_PORTFOLIO.map((model) => <article className="model-registry-row" key={model.id}>
            <div><strong>{model.name}</strong><p className="muted">{model.purpose}</p><small><b>Inputs:</b> {model.inputs}</small><p><small><b>Outputs:</b> {model.outputs}</small></p><small><b>Qualification:</b> {model.gate}</small></div>
            <span className="status status-pending">PLANNED</span>
          </article>)}
        </div>
        <p className="muted"><a href="https://github.com/smdgamekingindo-TN/ArcTester/blob/main/docs/APPROVED_MODEL_ARCHITECTURE.md" target="_blank" rel="noreferrer">Open exact input/output, dataset, evaluation and deployment contracts</a></p>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">STEP 1 · DATA</p><h2>Register training dataset</h2></div></div>
        <p className="muted">A dataset is the examples the model learns from. For a first run, use the downloadable synthetic template to test the workflow only. To train a model that could help real students, use authorized, anonymized historical learner data. Upload the prepared JSON file below; you do not need to edit the feature schema or raw JSON for a normal run.</p>
        <div className="admin-two-col">
          <label>Dataset name<input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} placeholder="ECET learner score history" /></label>
          <label>Target column<input value={targetColumn} onChange={(event) => setTargetColumn(event.target.value)} /></label>
          <label>Prediction task<select value={task} onChange={(event) => setTask(event.target.value as typeof task)}><option value="regression">Regression</option><option value="binary-classification">Binary classification</option></select></label>
          <label>Dataset provenance<select value={datasetKind} onChange={(event) => setDatasetKind(event.target.value as typeof datasetKind)}><option value="synthetic">Synthetic / experiment only</option><option value="real-anonymized">Real anonymized learner data</option></select></label>
        </div>
        <label>Source description<textarea value={sourceDescription} onChange={(event) => setSourceDescription(event.target.value)} placeholder="Describe where the data came from, how it was collected and why its use is authorized." /></label>
        <label className="dataset-attestation"><input type="checkbox" checked={sourceAttested} onChange={(event) => setSourceAttested(event.target.checked)} /> I confirm I am authorized to use this data and have removed direct personal identifiers.</label>
        <details className="model-lab-advanced"><summary>Advanced: feature schema (most users should leave this unchanged)</summary><p className="muted">This describes the input columns the model learns from. The default five features match ArcTester score-history data.</p><label>Feature schema JSON<textarea rows={7} spellCheck={false} value={featureSchemaText} onChange={(event) => setFeatureSchemaText(event.target.value)} /></label></details>
        <label className="dataset-upload-row"><div><strong>Training samples JSON</strong><small>Choose a .json file · 30–5,000 sample rows · maximum 8 MB</small></div><input aria-label="Training samples JSON file" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readDatasetFile(file); }} /></label><button type="button" className="button button-secondary" onClick={downloadSampleTemplate}>Download sample JSON template (synthetic)</button>
        {uploadName && <p className="muted">Selected file: {uploadName}</p>}
        {samplePreview && ("error" in samplePreview
          ? <p className="error" role="alert">{samplePreview.error}</p>
          : <div className="dataset-preview-summary" role="status"><strong>{samplePreview.rows.toLocaleString()} sample rows detected</strong><span>{samplePreview.features} features in first row · {task === "regression" ? "Regression target" : "Binary classification target"}</span><small>Full feature, target, privacy-group and row-level checks run before registration.</small></div>)}
        <details className="model-lab-advanced"><summary>Advanced: inspect or paste raw sample JSON</summary><p className="muted">Normally choose a prepared JSON file above. Open this only if you need to inspect or manually paste the rows.</p><label>Samples preview / JSON<textarea rows={10} spellCheck={false} value={samplesText} onChange={(event) => setSamplesText(event.target.value)} placeholder='[{"features":{"completed_attempts":12,"previous_accuracy":0.65,"recent_average_accuracy":0.7,"overall_average_accuracy":0.66,"previous_question_count":20},"target":0.72,"groupId":"64-character-keyed-hmac"}]' /></label></details>
        {formError && <p className="error" role="alert">{formError}</p>}
        <div className="editor-actions"><button className="primary" disabled={busy || !onRegisterDataset} onClick={submitDataset}>Validate and register dataset</button></div>
        <p className="muted">Real learner data must be authorized and pseudonymized. Never upload names, emails, raw student IDs or secrets. Synthetic datasets can be used for experiments but must never qualify a production model.</p>
      </section>

      <section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow">DATASET MANAGEMENT</p><h2>Registered datasets ({datasets.length})</h2></div></div>
        {datasets.length===0?<p className="muted">No datasets registered.</p>:datasets.map(dataset=><article className="model-registry-row" key={dataset.id}><div><strong>{dataset.name}</strong><p className="muted">{dataset.task} · {dataset.rowCount.toLocaleString()} rows · {dataset.datasetKind??"unknown provenance"}</p><small>{(dataset.targetColumn?"Target: "+dataset.targetColumn+" · ":"")+(dataset.featureSchema?.length??0)+" features · ID "+dataset.id}</small></div><div className="row wrap">{onEditDataset&&<button className="button button-secondary" disabled={busy} onClick={()=>{setEditingDatasetId(dataset.id);setEditingDatasetName(dataset.name);setEditingDatasetSource(dataset.sourceDescription??"");}}>Edit details</button>}{onDeleteDataset&&<button className="button button-secondary" disabled={busy} onClick={()=>onDeleteDataset(dataset.id)}>Delete</button>}</div></article>)}
        {editingDatasetId&&<div className="admin-panel model-dataset-editor"><h3>Edit dataset details</h3><label>Dataset name<input value={editingDatasetName} onChange={e=>setEditingDatasetName(e.target.value)}/></label><label>Source description<textarea value={editingDatasetSource} onChange={e=>setEditingDatasetSource(e.target.value)} placeholder="Enter updated provenance description (at least 10 characters)."/></label><div className="row wrap"><button className="primary" disabled={busy||!editingDatasetName.trim()||editingDatasetSource.trim().length<10} onClick={()=>{onEditDataset?.(editingDatasetId,{name:editingDatasetName.trim(),sourceDescription:editingDatasetSource.trim()});setEditingDatasetId("");}}>Save details</button><button className="ghost" onClick={()=>setEditingDatasetId("")}>Cancel</button></div><p className="muted">Editing is allowed only before a dataset is used by a model or training job.</p></div>}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">STEP 2 · TRAIN</p><h2>Train a candidate model</h2></div></div>
        <div className="model-training-options"><label>Model ID prefix<input value={modelPrefix} onChange={(event) => onModelPrefixChange(event.target.value)} /></label><label>Random seed<input type="number" min="0" max="4294967295" value={seed} onChange={event=>setSeed(event.target.value)} /></label><label>Epochs<input type="number" min="1" max="500" value={epochs} onChange={event=>setEpochs(event.target.value)} /></label><label>Batch size<input type="number" min="1" max="256" value={batchSize} onChange={event=>setBatchSize(event.target.value)} /></label></div>
        <label>Dataset<select value={selectedDatasetId} onChange={(event) => onDatasetChange(event.target.value)}><option value="">Select dataset</option>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.rowCount} rows · {dataset.featureSchema?.length ?? 0} features · {dataset.datasetKind ?? dataset.task}</option>)}</select></label>
        <div className="row wrap"><button className="primary" disabled={!selectedDatasetId || busy || !Number.isInteger(Number(seed)) || Number(seed)<0 || Number(seed)>4294967295 || !Number.isInteger(Number(epochs)) || Number(epochs)<1 || Number(epochs)>500 || !Number.isInteger(Number(batchSize)) || Number(batchSize)<1 || Number(batchSize)>256} onClick={()=>onQueueTraining({seed:Number(seed),epochs:Number(epochs),batchSize:Number(batchSize)})}>Queue TensorFlow.js</button><button className="button button-secondary" disabled={!selectedDatasetId || busy || !Number.isInteger(Number(seed)) || Number(seed)<0 || Number(seed)>4294967295} onClick={()=>onTrainClassical(Number(seed))}>Train logistic baseline</button></div><p className="muted"><strong>Which button?</strong> Use <b>Train logistic baseline</b> first to train the single supported classification baseline (logistic regression) or the regression baseline (multiple linear regression), depending on the dataset task. Use <b>Queue TensorFlow.js</b> to experiment with the neural network on numeric regression data. Both create inactive candidates; neither changes the live model.</p>
        {loading ? <div className="model-lab-loading" role="status" aria-label="Loading model datasets"><div className="skeleton skeleton-table-row" /><div className="skeleton skeleton-table-row" /></div> : datasets.length === 0 && <p className="muted">No registered datasets yet. Register a dataset above first.</p>}
      </section>

      <section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow">MODEL REGISTRY</p><h2>Models and versions ({models.length})</h2></div></div>
        <div className="model-registry-toolbar"><input placeholder="Search model, algorithm or dataset…" aria-label="Search models" value={modelSearch} onChange={e=>setModelSearch(e.target.value)}/><select aria-label="Filter algorithm" value={algorithmFilter} onChange={e=>setAlgorithmFilter(e.target.value)}><option value="all">All algorithms</option>{algorithms.map(x=><option key={x}>{x}</option>)}</select></div>
        {loading?<p className="muted">Loading registry…</p>:visibleModels.length===0?<p className="muted">{models.length?"No matching models.":"No candidates registered."}</p>:<div className="model-registry-list">{visibleModels.map(model=>{const baseline=models.filter(x=>x.modelId===model.modelId&&x.version<model.version).sort((x,y)=>y.version-x.version)[0];const legacy=LEGACY_BASELINE_ALGORITHMS.has(model.algorithm);return <article className="model-registry-row" key={model.modelId+"-"+model.version}><div><strong>{model.modelId} · v{model.version}</strong><p className="muted">{model.algorithm} · {model.task} · {model.dataset}</p><small>{model.createdAt?new Date(model.createdAt).toLocaleString():"Date unavailable"}</small></div><div className="row wrap"><span className={"status "+(model.isActive?"status-used":"status-pending")}>{model.isActive?"ACTIVE":"INACTIVE"}</span>{legacy&&<span className="status status-expired">LEGACY · RETAINED</span>}{model.productionEligible===true?<span className="status status-used">ELIGIBLE</span>:model.productionEligible===false?<span className="status status-expired">NOT ELIGIBLE</span>:null}{baseline&&selectedDatasetId&&model.algorithm!=="tensorflow-js-layers"&&onEvaluateModel&&<button className="button button-secondary" disabled={busy} onClick={()=>onEvaluateModel(model.modelId,model.version,baseline.version,selectedDatasetId)}>Evaluate vs v{baseline.version}</button>}{!legacy&&!model.isActive&&model.productionEligible!==false&&<button className="button button-secondary" disabled={busy||actionBusy} onClick={async()=>{setActionBusy(true);try{const r=await fetch((import.meta.env.VITE_API_URL||"https://arctester.onrender.com").replace(/\/+$/,"")+`/admin/models/${encodeURIComponent(model.modelId)}/${model.version}/activate`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:"{}"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Activation failed");onRefresh();}catch(e){setTestError(e instanceof Error?e.message:"Activation failed");}finally{setActionBusy(false);}}}>Activate</button>}<button className="button button-secondary" disabled={historyLoading} onClick={()=>void loadModelHistory(model.modelId)}>History</button>{!model.isActive&&onDeleteModel&&<button className="button button-danger" disabled={busy||actionBusy} onClick={()=>onDeleteModel(model.modelId,model.version)}>Delete version</button>}</div></article>})}</div>}
        <p className="muted">The API enforces evaluation and production eligibility before activation.</p></section>      {historyModelId&&<section className="admin-panel model-history-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">MODEL GOVERNANCE</p><h2>History · {historyModelId}</h2><p className="muted">Evaluation evidence and administrative actions for every version of this model.</p></div><button className="ghost" onClick={()=>{setHistoryModelId("");setAuditEvents([]);setEvaluationHistory([]);setHistoryError("");}}>Close</button></div>
        {historyLoading?<p className="muted" role="status">Loading audit and evaluation history…</p>:historyError?<p className="error" role="alert">{historyError}</p>:<>
          <h3>Evaluation history ({evaluationHistory.length})</h3>
          {evaluationHistory.length===0?<p className="muted">No evaluation records found.</p>:<div className="model-history-list">{evaluationHistory.map(item=><article className="model-history-entry" key={item.id}>
            <div className="row wrap"><strong>Candidate v{item.candidateVersion} vs baseline v{item.baselineVersion}</strong><span className={"status "+(item.status==="PASSED"?"status-used":"status-expired")}>{item.status}</span></div>
            <p className="muted">{item.evaluationDataset} · {item.sampleCount.toLocaleString()} holdout samples · {new Date(item.evaluatedAt).toLocaleString()}</p>
            <small>Dataset fingerprint: {item.datasetFingerprint}</small>
            <details><summary>Metrics and acceptance rule</summary><pre className="model-result-json">{JSON.stringify(item.metrics,null,2)}</pre></details>
          </article>)}</div>}
          <h3>Audit trail ({auditEvents.length})</h3>
          {auditEvents.length===0?<p className="muted">No administrative events found.</p>:<div className="model-history-list">{auditEvents.map(event=><article className="model-history-entry" key={event.id}>
            <div className="row wrap"><strong>{event.action} · v{event.version}</strong><small>{new Date(event.createdAt).toLocaleString()}</small></div>
            <p className="muted">Actor ID: {event.actorId??"Unavailable"} · Event ID: {event.id}</p>
            <details><summary>Event details</summary><pre className="model-result-json">{JSON.stringify(event.details,null,2)}</pre></details>
          </article>)}</div>}
        </>}
      </section>}
      <section className="admin-panel"><p className="eyebrow">PREDICTION PLAYGROUND</p><h2>Test active model</h2><p className="muted">Run a sample prediction using the live registry endpoint.</p>
        <label>Active model<select value={testModelId} onChange={e=>{setTestModelId(e.target.value);setTestFeatures({});setTestResult(null);setTestError("");}}><option value="">Choose model</option>{models.filter(x=>x.isActive&&x.algorithm!=="tensorflow-js-layers").map(x=><option key={x.modelId} value={x.modelId}>{x.modelId} · v{x.version}</option>)}</select></label>
        {selectedTestModel?<><div className="model-test-fields">{testSchema.map(f=><label key={f.name}>{f.name}{f.type==="categorical"?<select value={testFeatures[f.name]??""} onChange={e=>setTestFeatures(v=>({...v,[f.name]:e.target.value}))}><option value="">Choose…</option>{(f as {categories?:string[]}).categories?.map(x=><option key={x}>{x}</option>)}</select>:<input type="number" step="any" value={testFeatures[f.name]??""} onChange={e=>setTestFeatures(v=>({...v,[f.name]:e.target.value}))}/>}</label>)}</div><button className="primary" disabled={actionBusy||testSchema.some(f=>!testFeatures[f.name]?.trim())} onClick={async()=>{setActionBusy(true);setTestError("");setTestResult(null);try{const features=Object.fromEntries(testSchema.map(f=>[f.name,f.type==="numeric"?Number(testFeatures[f.name]):testFeatures[f.name]]));const r=await fetch((import.meta.env.VITE_API_URL||"https://arctester.onrender.com").replace(/\/+$/,"")+`/admin/models/${encodeURIComponent(testModelId)}/predict`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({features})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Prediction test failed");setTestResult(d.prediction);}catch(e){setTestError(e instanceof Error?e.message:"Prediction test failed");}finally{setActionBusy(false);}}}>Run prediction test</button>{testError&&<p className="error" role="alert">{testError}</p>}{testResult!==null&&<pre className="model-result-json">{JSON.stringify(testResult,null,2)}</pre>}</>:<p className="muted">Select an active statistical model. TensorFlow.js uses its dedicated inference path.</p>}</section>
      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">STEP 3 · OBSERVE</p><h2>Training jobs and evaluation</h2></div></div>
        {loading ? <div className="model-lab-loading" role="status" aria-label="Loading training jobs"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div> : jobs.length === 0 ? <p className="muted">No training jobs yet.</p> : jobs.map((job) => (
          <article key={job.id} className="question-review-row">
            <div className="panel-header"><strong>{job.modelId}</strong><div className="row wrap"><span className={job.status === "SUCCEEDED" ? "status status-used" : job.status === "FAILED" || job.status === "CANCELLED" ? "status status-expired" : "status status-pending"}>{job.status}</span>{(job.status === "QUEUED" || job.status === "RUNNING") && onCancelJob && <button type="button" className="button button-secondary" disabled={busy} onClick={() => onCancelJob(job.id)}>Cancel job</button>}</div></div>
            <p className="muted">Job {job.id} · Dataset {job.datasetId}</p>
            <div className="training-progress" role="progressbar" aria-label={job.modelId + " training progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, job.progress))}><span style={{ width: Math.max(0, Math.min(100, job.progress)) + "%" }} /></div>
            <p>{job.progress}% complete</p>
            {job.status==="RUNNING"&&<div className="training-live-metrics"><div className="training-live-heading"><strong>Live training metrics</strong><span>Auto-refreshes every 5 seconds · {job.liveMetrics?.epoch??0}/{job.liveMetrics?.totalEpochs??"—"} epochs</span></div><div className="training-chart-grid"><TrainingMetricChart title="Training loss (MSE)" points={epochHistory[job.id]??[]} metric="loss" totalEpochs={job.liveMetrics?.totalEpochs??0}/><TrainingMetricChart title="Training MAE" points={epochHistory[job.id]??[]} metric="mae" totalEpochs={job.liveMetrics?.totalEpochs??0}/></div>{job.liveMetrics?.updatedAt&&<small className="muted">Last metric update: {new Date(job.liveMetrics.updatedAt).toLocaleTimeString()}</small>}</div>}
            
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
                {result.candidate && result.baseline && (() => {
                  const maeKnown = typeof result.candidate.mae === "number" && typeof result.baseline.mae === "number";
                  const rmseKnown = typeof result.candidate.rmse === "number" && typeof result.baseline.rmse === "number";
                  const beatsMae = maeKnown && result.candidate.mae! < result.baseline.mae!;
                  const beatsRmse = rmseKnown && result.candidate.rmse! < result.baseline.rmse!;
                  const compared = maeKnown && rmseKnown;
                  return <div className="model-result-explanation" role="status">
                    <strong>{result.productionEligible ? "What this means: candidate passed the evaluation gate." : "What this means: keep this candidate inactive."}</strong>
                    <p>{compared ? (beatsMae && beatsRmse ? "The candidate has lower average error on both metrics. It may proceed to the remaining approval checks; it is not automatically deployed." : "The candidate did not beat the baseline on both error metrics. The current baseline is the safer choice for predictions.") : "The report does not contain enough comparable error metrics to decide whether this candidate is better."}</p>
                    <p><b>Next action:</b> {result.productionEligible ? "Review the data source, holdout split and approval record before activation." : "Do not activate or deploy it. Check data quality, collect more representative real-world examples, then train and evaluate a new candidate."}</p>
                  </div>;
                })()}
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
