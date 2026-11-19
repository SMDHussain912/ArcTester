import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminModelLab, { type ModelLabDataset, type ModelLabJob } from "./AdminModelLab";

const datasets: ModelLabDataset[] = [{ id: "dataset-1", name: "CSE readiness", task: "regression", rowCount: 120, featureSchema: [{ name: "score", type: "numeric" }] }];
const jobs: ModelLabJob[] = [{ id: "job-1", datasetId: "dataset-1", modelId: "ecet-readiness-tensorflow", status: "RUNNING", progress: 45, errorMessage: "" }];

describe("AdminModelLab", () => {
  it("renders datasets, training controls and job progress", () => {
    render(<AdminModelLab datasets={datasets} jobs={jobs} models={[]} selectedDatasetId="dataset-1" modelPrefix="ecet-readiness" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onTrainClassical={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Model lab" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "CSE readiness · 120 rows · regression" })).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Training model prefix"), { target: { value: "new-prefix" } });
    fireEvent.change(screen.getByLabelText("Dataset"), { target: { value: "dataset-1" } });
    rerender(<AdminModelLab datasets={datasets} jobs={[]} models={[]} selectedDatasetId="dataset-1" modelPrefix="new-prefix" busy={false} onDatasetChange={onDatasetChange} onModelPrefixChange={onModelPrefixChange} onQueueTraining={onQueueTraining} onTrainClassical={vi.fn()} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Queue TensorFlow.js" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onModelPrefixChange).toHaveBeenCalledWith("new-prefix");
    expect(onDatasetChange).toHaveBeenCalledWith("dataset-1");
    expect(onQueueTraining).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
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

});