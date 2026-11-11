export type ModelLabDataset = { id: string; name: string; task: string; rowCount: number };
export type ModelLabJob = { id: string; datasetId: string; modelId: string; status: string; progress: number; errorMessage: string };

type AdminModelLabProps = {
  datasets: ModelLabDataset[];
  jobs: ModelLabJob[];
  selectedDatasetId: string;
  modelPrefix: string;
  busy: boolean;
  onDatasetChange: (id: string) => void;
  onModelPrefixChange: (prefix: string) => void;
  onQueueTraining: () => void;
  onRefresh: () => void;
};

export default function AdminModelLab({ datasets, jobs, selectedDatasetId, modelPrefix, busy, onDatasetChange, onModelPrefixChange, onQueueTraining, onRefresh }: AdminModelLabProps) {
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">MODEL OPERATIONS</p><h1>Model lab</h1><p>Register evaluation datasets and run durable TensorFlow.js training jobs.</p></div><button className="ghost" onClick={onRefresh}>Refresh</button></div>
      <section className="admin-panel">
        <label>Training model prefix<input value={modelPrefix} onChange={(event) => onModelPrefixChange(event.target.value)} /></label>
        <label>Dataset<select value={selectedDatasetId} onChange={(event) => onDatasetChange(event.target.value)}><option value="">Select dataset</option>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.rowCount} rows</option>)}</select></label>
        <button className="primary" disabled={!selectedDatasetId || busy} onClick={onQueueTraining}>Queue TensorFlow.js</button>
      </section>
      <section className="admin-panel"><h2>TensorFlow.js training jobs</h2>{jobs.length === 0 ? <p>No training jobs yet.</p> : jobs.map((job) => <article key={job.id} className="question-review-row"><strong>{job.modelId}</strong><p>{job.status} · {job.progress}%</p>{job.errorMessage && <p className="error">{job.errorMessage}</p>}</article>)}</section>
    </>
  );
}
