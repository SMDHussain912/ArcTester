import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminModelLab, { type ModelLabDataset, type ModelLabJob } from "./AdminModelLab";

const datasets: ModelLabDataset[] = [{ id: "dataset-1", name: "CSE readiness", task: "regression", rowCount: 120, featureSchema: [{ name: "score", type: "numeric" }] }];
const jobs: ModelLabJob[] = [{ id: "job-1", datasetId: "dataset-1", modelId: "ecet-readiness-tensorflow", status: "RUNNING", progress: 45, errorMessage: "" }];

describe("AdminModelLab", () => {
  it("shows implementation progress for the six approved model capabilities", () => {
    render(<AdminModelLab datasets={[]} jobs={[]} models={[]} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} />);
    for (const name of ["Gradient Boosting", "Random Forest", "Readiness Classifier", "Adaptive Learning", "Question Embeddings", "Exam Anomaly Detection"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText("2 trainable · 4 core engines in progress")).toBeTruthy();
    expect(screen.getAllByText("TRAINABLE · CANDIDATE ONLY")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
  });

  it("keeps redundant classical candidates visible as legacy without offering activation", () => {
    render(<AdminModelLab datasets={[]} jobs={[]} models={[{ modelId: "old-tree", version: 1, algorithm: "decision-tree", task: "regression", dataset: "legacy data", isActive: false }]} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} onDeleteModel={vi.fn()} />);
    expect(screen.getByText("LEGACY · RETAINED")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Activate" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete version" })).toBeTruthy();
  });

  it("disables TensorFlow.js for binary-classification datasets", () => {
    render(<AdminModelLab datasets={[{ ...datasets[0], task: "binary-classification" }]} jobs={[]} models={[]} selectedDatasetId="dataset-1" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Queue TensorFlow.js" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/TensorFlow.js requires a regression dataset with numeric-only features/i)).toBeTruthy();
  });

  it("labels regression training as the performance model suite", () => {
    render(<AdminModelLab datasets={datasets} jobs={[]} models={[]} selectedDatasetId="dataset-1" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Train performance models" })).toBeTruthy();
  });

  it("renders datasets, training controls and job progress", () => {
    render(<AdminModelLab datasets={datasets} jobs={jobs} models={[]} selectedDatasetId="dataset-1" modelPrefix="ecet-readiness" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Model lab" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "CSE readiness · 120 rows · 1 features · regression" })).toBeTruthy();
    expect(screen.getByText("ecet-readiness-tensorflow")).toBeTruthy();
    expect(screen.getByText("RUNNING")).toBeTruthy();
    expect(screen.getByText("45% complete")).toBeTruthy();
  });

  it("shows the empty job state and disables queueing without a dataset", () => {
    render(<AdminModelLab datasets={[]} jobs={[]} models={[]} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText("No training jobs yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Queue TensorFlow.js" }).hasAttribute("disabled")).toBe(true);
  });

  it("delegates model configuration, dataset selection, queueing and refresh", () => {
    const onDatasetChange = vi.fn(), onModelPrefixChange = vi.fn(), onQueueTraining = vi.fn(), onRefresh = vi.fn();
    const { rerender } = render(<AdminModelLab datasets={datasets} jobs={[]} models={[]} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={onDatasetChange} onModelPrefixChange={onModelPrefixChange} onQueueTraining={onQueueTraining} onTrainClassical={vi.fn()} onRefresh={onRefresh} />);
    fireEvent.change(screen.getByLabelText("Model ID prefix"), { target: { value: "new-prefix" } });
    fireEvent.change(screen.getByLabelText("Dataset"), { target: { value: "dataset-1" } });
    rerender(<AdminModelLab datasets={datasets} jobs={[]} models={[]} selectedDatasetId="dataset-1" modelPrefix="new-prefix" busy={false} onDatasetChange={onDatasetChange} onModelPrefixChange={onModelPrefixChange} onQueueTraining={onQueueTraining} onTrainClassical={vi.fn()} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Queue TensorFlow.js" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onModelPrefixChange).toHaveBeenCalledWith("new-prefix");
    expect(onDatasetChange).toHaveBeenCalledWith("dataset-1");
    expect(onQueueTraining).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
  it("rejects non-binary target values for classification datasets", () => {
    const onRegisterDataset = vi.fn();
    render(<AdminModelLab datasets={[]} jobs={[]} models={[]} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} onRegisterDataset={onRegisterDataset} />);
    fireEvent.change(screen.getByLabelText("Dataset name"), { target: { value: "Classification dataset" } });
    fireEvent.change(screen.getByLabelText("Source description"), { target: { value: "Synthetic binary classification experiment data." } });
    fireEvent.change(screen.getByLabelText("Prediction task"), { target: { value: "binary-classification" } });
    const rows = Array.from({ length: 30 }, (_, index) => ({
      features: { completed_attempts: 3 + index, previous_accuracy: 0.6, recent_average_accuracy: 0.65, overall_average_accuracy: 0.62, previous_question_count: 20 },
      target: index === 0 ? 0.5 : index % 2,
      groupId: (index % 5).toString(16).padStart(64, "0"),
    }));
    fireEvent.change(screen.getByLabelText("Samples preview / JSON"), { target: { value: JSON.stringify(rows) } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Validate and register dataset" }));
    expect(screen.getByRole("alert").textContent).toContain("exactly 0 or 1");
    expect(onRegisterDataset).not.toHaveBeenCalled();
  });

  it("rejects rows with missing or non-numeric feature values before registration", () => {
    const onRegisterDataset = vi.fn();
    render(<AdminModelLab datasets={[]} jobs={[]} models={[]} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} onRegisterDataset={onRegisterDataset} />);
    fireEvent.change(screen.getByLabelText("Dataset name"), { target: { value: "Invalid dataset" } });
    fireEvent.change(screen.getByLabelText("Source description"), { target: { value: "Synthetic test data for validation checks." } });
    const rows = Array.from({ length: 30 }, (_, index) => ({
      features: { completed_attempts: index === 0 ? "three" : 3 + index, previous_accuracy: 0.6, recent_average_accuracy: 0.65, overall_average_accuracy: 0.62, previous_question_count: 20 },
      target: 0.7,
      groupId: (index % 5).toString(16).padStart(64, "0"),
    }));
    fireEvent.change(screen.getByLabelText("Samples preview / JSON"), { target: { value: JSON.stringify(rows) } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Validate and register dataset" }));
    expect(screen.getByRole("alert").textContent).toContain("invalid numeric value");
    expect(onRegisterDataset).not.toHaveBeenCalled();
  });

  it("offers cancellation for queued and running training jobs", () => {
    const onCancelJob = vi.fn();
    render(<AdminModelLab datasets={datasets} jobs={jobs} models={[]} selectedDatasetId="dataset-1" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} onCancelJob={onCancelJob} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel job" }));
    expect(onCancelJob).toHaveBeenCalledWith("job-1");
  });

  it("requires a reason and sends audited activation and rollback requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, model: { isActive: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const models = [
      { modelId: "readiness-model", version: 1, algorithm: "logistic-regression", task: "binary-classification", dataset: "CSE readiness", isActive: false, activatedAt: "2026-01-01T00:00:00.000Z" },
      { modelId: "readiness-model", version: 2, algorithm: "logistic-regression", task: "binary-classification", dataset: "CSE readiness", isActive: true, activatedAt: "2026-02-01T00:00:00.000Z" },
      { modelId: "readiness-model", version: 3, algorithm: "logistic-regression", task: "binary-classification", dataset: "CSE readiness", isActive: false, productionEligible: true },
    ];
    render(<AdminModelLab datasets={[]} jobs={[]} models={models} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} />);
    const activateButtons = screen.getAllByRole("button", { name: "Activate" });
    expect(activateButtons).toHaveLength(2);
    expect(activateButtons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole("button", { name: "Rollback" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Governance reason"), { target: { value: "Candidate passed independent real-anonymized evaluation." } });
    const versionThreeActivate = screen.getAllByRole("button", { name: "Activate" })
      .find((button) => button.closest("article")?.textContent?.includes("v3"));
    expect(versionThreeActivate).toBeTruthy();
    fireEvent.click(versionThreeActivate!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/models/readiness-model/3/activate"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Candidate passed independent real-anonymized evaluation." }) }),
    ));

    fireEvent.change(screen.getByLabelText("Governance reason"), { target: { value: "Rollback after observed production quality regression." } });
    fireEvent.click(screen.getByRole("button", { name: "Rollback" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/models/readiness-model/rollback"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Rollback after observed production quality regression." }) }),
    ));
    vi.unstubAllGlobals();
  });

  it("offers holdout comparison against the previous candidate version", () => {
    const onEvaluateModel = vi.fn();
    const registry = [
      { modelId: "readiness-model", version: 1, algorithm: "logistic-regression", task: "binary-classification", dataset: "CSE readiness", isActive: false },
      { modelId: "readiness-model", version: 2, algorithm: "logistic-regression", task: "binary-classification", dataset: "CSE readiness", isActive: false },
    ];
    render(<AdminModelLab datasets={[{ ...datasets[0], task: "binary-classification" }]} jobs={[]} models={registry} selectedDatasetId="dataset-1" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} onEvaluateModel={onEvaluateModel} />);
    fireEvent.click(screen.getByRole("button", { name: "Evaluate vs v1" }));
    expect(onEvaluateModel).toHaveBeenCalledWith("readiness-model", 2, 1, "dataset-1");
  });

  it("registers a JSON dataset with provenance and feature schema", () => {
    const onRegisterDataset = vi.fn();
    render(<AdminModelLab datasets={[]} jobs={[]} models={[]} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} onRegisterDataset={onRegisterDataset} />);
    fireEvent.change(screen.getByLabelText("Dataset name"), { target: { value: "ECET score history" } });
    fireEvent.change(screen.getByLabelText("Source description"), { target: { value: "Authorized anonymized historical assessment records." } });
    fireEvent.change(screen.getByLabelText("Samples preview / JSON"), { target: { value: JSON.stringify(Array.from({ length: 30 }, (_, index) => ({ features: { completed_attempts: 3 + index, previous_accuracy: 0.6, recent_average_accuracy: 0.65, overall_average_accuracy: 0.62, previous_question_count: 20 }, target: 0.7, groupId: (index % 5).toString(16).padStart(64, "0") }))) } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Validate and register dataset" }));
    expect(onRegisterDataset).toHaveBeenCalledTimes(1);
    expect(onRegisterDataset.mock.calls[0][0]).toMatchObject({ name: "ECET score history", task: "regression", targetColumn: "next_score", sourceAttested: true, datasetKind: "synthetic" });
  });

  it("explains when a TensorFlow candidate loses to the baseline", () => {
    const completed: ModelLabJob[] = [{ id: "job-2", datasetId: "dataset-1", modelId: "ecet-readiness-tensorflow", status: "SUCCEEDED", progress: 100, errorMessage: "", result: { productionEligible: false, candidate: { mae: 0.0526, rmse: 0.0671 }, baseline: { mae: 0.0495, rmse: 0.0599 }, reason: "Candidate did not beat both baseline metrics." } }];
    render(<AdminModelLab datasets={datasets} jobs={completed} models={[]} selectedDatasetId="dataset-1" modelPrefix="ecet-readiness" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText("keep this candidate inactive.", { exact: false })).toBeTruthy();
    expect(screen.getByText(/current baseline is the safer choice/i)).toBeTruthy();
    expect(screen.getByText(/Do not activate or deploy it/i)).toBeTruthy();
  });

});