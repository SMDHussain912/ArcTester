import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminModelLab, { type ModelLabDataset, type ModelLabJob } from "./AdminModelLab";

const datasets: ModelLabDataset[] = [{ id: "dataset-1", name: "CSE readiness", task: "classification", rowCount: 120 }];
const jobs: ModelLabJob[] = [{ id: "job-1", datasetId: "dataset-1", modelId: "ecet-readiness-tensorflow", status: "RUNNING", progress: 45, errorMessage: "" }];

describe("AdminModelLab", () => {
  it("renders datasets, training controls and job progress", () => {
    render(<AdminModelLab datasets={datasets} jobs={jobs} selectedDatasetId="dataset-1" modelPrefix="ecet-readiness" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Model lab" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "CSE readiness · 120 rows" })).toBeTruthy();
    expect(screen.getByText("ecet-readiness-tensorflow")).toBeTruthy();
    expect(screen.getByText("RUNNING · 45%")).toBeTruthy();
  });

  it("shows the empty job state and disables queueing without a dataset", () => {
    render(<AdminModelLab datasets={[]} jobs={[]} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={vi.fn()} onModelPrefixChange={vi.fn()} onQueueTraining={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText("No training jobs yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Queue TensorFlow.js" }).hasAttribute("disabled")).toBe(true);
  });

  it("delegates model configuration, dataset selection, queueing and refresh", () => {
    const onDatasetChange = vi.fn(), onModelPrefixChange = vi.fn(), onQueueTraining = vi.fn(), onRefresh = vi.fn();
    const { rerender } = render(<AdminModelLab datasets={datasets} jobs={[]} selectedDatasetId="" modelPrefix="model" busy={false} onDatasetChange={onDatasetChange} onModelPrefixChange={onModelPrefixChange} onQueueTraining={onQueueTraining} onRefresh={onRefresh} />);
    fireEvent.change(screen.getByLabelText("Training model prefix"), { target: { value: "new-prefix" } });
    fireEvent.change(screen.getByLabelText("Dataset"), { target: { value: "dataset-1" } });
    rerender(<AdminModelLab datasets={datasets} jobs={[]} selectedDatasetId="dataset-1" modelPrefix="new-prefix" busy={false} onDatasetChange={onDatasetChange} onModelPrefixChange={onModelPrefixChange} onQueueTraining={onQueueTraining} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Queue TensorFlow.js" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onModelPrefixChange).toHaveBeenCalledWith("new-prefix");
    expect(onDatasetChange).toHaveBeenCalledWith("dataset-1");
    expect(onQueueTraining).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
