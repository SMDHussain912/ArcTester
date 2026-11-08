"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "../../../lib/session";
import { api, ApiError, type AdminModelDataset, type AdminRegisteredModel, type TensorflowTrainingReport } from "../../../lib/api";

const featureSchemaExample = '[{"name":"practice_score","type":"numeric"}]';
const samplesExample = `[
  {"features":{"practice_score":40},"target":45,"groupId":"<64-character-sha256-pseudonym>"},
  {"features":{"practice_score":55},"target":60,"groupId":"<64-character-sha256-pseudonym>"}
]`;

export default function AdminModelsPage() {
  const { status, user } = useSession();
  const [datasets, setDatasets] = useState<AdminModelDataset[]>([]);
  const [models, setModels] = useState<AdminRegisteredModel[]>([]);
  const [name, setName] = useState("");
  const [targetColumn, setTargetColumn] = useState("next_score");
  const [sourceDescription, setSourceDescription] = useState("");
  const [datasetKind, setDatasetKind] = useState<"synthetic" | "real-anonymized">("synthetic");
  const [featureSchemaJson, setFeatureSchemaJson] = useState(featureSchemaExample);
  const [samplesJson, setSamplesJson] = useState("");
  const [attested, setAttested] = useState(false);
  const [modelId, setModelId] = useState("student-score-population");
  const [epochs, setEpochs] = useState(80);
  const [batchSize, setBatchSize] = useState(32);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [report, setReport] = useState<TensorflowTrainingReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [datasetResult, modelResult] = await Promise.all([
      api.adminModelDatasets(),
      api.adminRegisteredModels(),
    ]);
    setDatasets(datasetResult.datasets);
    setModels(modelResult.models);
    setSelectedDatasetId((current) => current || datasetResult.datasets[0]?.id || "");
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || user?.role !== "ADMIN") return;
    load().catch((cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : "Could not load model registry data.");
    });
  }, [status, user?.role, load]);

  async function registerDataset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setReport(null);
    try {
      const featureSchema = JSON.parse(featureSchemaJson) as Array<{ name: string; type: "numeric" }>;
      const samples = JSON.parse(samplesJson) as Array<{ features: Record<string, number>; target: number; groupId: string }>;
      const result = await api.registerAdminModelDataset({
        name,
        task: "regression",
        targetColumn,
        featureSchema,
        samples,
        sourceDescription,
        sourceAttested: true,
        datasetKind,
      });
      setSelectedDatasetId(result.dataset.id);
      setNotice(`Dataset registered: ${result.dataset.name} (${result.dataset.rowCount} rows).`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Dataset registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function trainDataset(datasetId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    setReport(null);
    setSelectedDatasetId(datasetId);
    try {
      const result = await api.trainAdminTensorflowDataset(datasetId, {
        modelId,
        epochs,
        batchSize,
        seed: 42,
      });
      setReport(result);
      setNotice(result.message);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "TensorFlow.js training failed.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <p className="mute">Checking administrator access…</p>;
  if (status !== "authenticated") return <section className="panel"><h1>Model intelligence</h1><p>Sign in with an administrator account to continue.</p><Link className="button" href="/login">Sign in</Link></section>;
  if (user?.role !== "ADMIN") return <section className="panel"><h1>Access restricted</h1><p className="mute">Model training is available to administrator accounts only.</p><Link className="button button-secondary" href="/">Back to dashboard</Link></section>;

  return (
    <div className="stack">
      <section className="page-intro">
        <p className="eyebrow">ArcTester · model governance</p>
        <h1>Model intelligence</h1>
        <p className="muted">Register numeric regression datasets, train grouped TensorFlow.js candidates and inspect model versions. Training never promotes a model automatically.</p>
        <Link href="/admin" className="button button-secondary">Back to admin workspace</Link>
      </section>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="warn" role="status">{notice}</p> : null}

      <section className="panel stack">
        <div>
          <h2>Register a training dataset</h2>
          <p className="muted">TensorFlow.js currently supports regression with numeric features. Every sample needs a stable 64-character SHA-256 pseudonymous groupId so one learner never appears in both train and holdout groups.</p>
        </div>
        <form className="stack" onSubmit={registerDataset}>
          <label>Dataset name<input className="input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label>
          <label>Target column<input className="input" value={targetColumn} onChange={(event) => setTargetColumn(event.target.value)} required maxLength={120} /></label>
          <label>Dataset provenance
            <select className="input" value={datasetKind} onChange={(event) => setDatasetKind(event.target.value as "synthetic" | "real-anonymized")}>
              <option value="synthetic">Synthetic / experiment only</option>
              <option value="real-anonymized">Real anonymized learner data</option>
            </select>
          </label>
          <label>Source description<textarea className="input" rows={3} value={sourceDescription} onChange={(event) => setSourceDescription(event.target.value)} required minLength={10} maxLength={500} /></label>
          <label>Feature schema JSON<textarea className="input" rows={3} value={featureSchemaJson} onChange={(event) => setFeatureSchemaJson(event.target.value)} required /></label>
          <label>Samples JSON<textarea className="input" rows={8} value={samplesJson} onChange={(event) => setSamplesJson(event.target.value)} required placeholder={samplesExample} /></label>
          <p className="muted">Do not put names, emails, phone numbers or raw student IDs in groupId. Generate a stable SHA-256 pseudonym outside this dataset and use the same pseudonym for all rows from the same learner.</p>
          <label className="checkbox-row">
            <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} required />
            I confirm this dataset is authorized for model training and contains no direct learner identifiers. If marked real anonymized, I confirm the source and anonymization are genuine.
          </label>
          <button className="button button-primary" type="submit" disabled={busy || !attested}>Register dataset</button>
        </form>
      </section>

      <section className="panel stack">
        <div>
          <h2>Train TensorFlow.js candidate</h2>
          <p className="muted">Requires at least 30 rows, 5 unique learner groups and at least 20 held-out rows. Candidate must beat or tie the linear-regression baseline on both MAE and RMSE.</p>
        </div>
        <label>Model ID<input className="input" value={modelId} onChange={(event) => setModelId(event.target.value)} pattern="[a-z0-9][a-z0-9-]{0,47}" required /></label>
        <div className="grid">
          <label>Epochs<input className="input" type="number" min={1} max={500} value={epochs} onChange={(event) => setEpochs(Number(event.target.value))} /></label>
          <label>Batch size<input className="input" type="number" min={1} max={256} value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value))} /></label>
        </div>
        {datasets.length === 0 ? <p className="muted">No registered datasets yet.</p> : (
          <div className="stack">
            {datasets.map((dataset) => {
              const supported = dataset.task === "regression" && dataset.featureSchema.every((feature) => feature.type === "numeric");
              return (
                <article className="panel" key={dataset.id}>
                  <div className="row-between">
                    <div>
                      <strong>{dataset.name}</strong>
                      <p className="muted">{dataset.rowCount} rows · {dataset.datasetKind} · {dataset.task}</p>
                    </div>
                    <button className="button button-secondary" type="button" disabled={busy || !supported} onClick={() => trainDataset(dataset.id)}>
                      {busy && selectedDatasetId === dataset.id ? "Training…" : "Train candidate"}
                    </button>
                  </div>
                  {!supported ? <p className="muted">TensorFlow.js requires a numeric regression dataset.</p> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {report ? (
        <section className="panel stack" aria-live="polite">
          <h2>Latest training report</h2>
          <p>{report.reason}</p>
          <div className="grid">
            <div><span className="muted">Candidate MAE</span><strong>{report.candidate.mae.toFixed(4)}</strong></div>
            <div><span className="muted">Baseline MAE</span><strong>{report.baseline.mae.toFixed(4)}</strong></div>
            <div><span className="muted">Candidate RMSE</span><strong>{report.candidate.rmse.toFixed(4)}</strong></div>
            <div><span className="muted">Baseline RMSE</span><strong>{report.baseline.rmse.toFixed(4)}</strong></div>
          </div>
          <p className="muted">Train: {report.split.trainRows} rows / {report.split.trainGroups} groups · Holdout: {report.split.testRows} rows / {report.split.testGroups} groups</p>
          <p><strong>{report.model ? `Registered inactive model v${report.model.version}` : "No model artifact registered"}</strong></p>
          <p className="muted">Production eligible: {report.productionEligible ? "Yes" : "No"} · Automatically promoted: No</p>
        </section>
      ) : null}

      <section className="panel stack">
        <h2>Registered model versions</h2>
        {models.length === 0 ? <p className="muted">No model versions registered.</p> : models.map((model) => (
          <div className="row-between" key={model.modelId + ":" + model.version}>
            <div><strong>{model.modelId} · v{model.version}</strong><p className="muted">{model.algorithm} · {model.dataset}</p></div>
            <span className={model.isActive ? "status status-success" : "status"}>{model.isActive ? "Active" : "Inactive"}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
