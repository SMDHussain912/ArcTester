import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminModelsPage from "./page";
import { api } from "../../../lib/api";

vi.mock("../../../lib/session", () => ({
  useSession: () => ({ status: "authenticated", user: { role: "ADMIN" } }),
}));

vi.mock("../../../lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    adminModelDatasets: vi.fn(),
    adminRegisteredModels: vi.fn(),
    trainAdminTensorflowDataset: vi.fn(),
    registerAdminModelDataset: vi.fn(),
    activateAdminModelVersion: vi.fn(),
  },
}));

const dataset = {
  id: "dataset-1",
  name: "student-score-fixture",
  task: "regression" as const,
  targetColumn: "next_score",
  featureSchema: [{ name: "practice_score", type: "numeric" as const }],
  rowCount: 100,
  sourceDescription: "Synthetic UI fixture for model training.",
  sourceAttested: true,
  datasetKind: "synthetic" as const,
  fingerprint: "a".repeat(64),
  createdAt: new Date().toISOString(),
};

describe("admin model intelligence workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.adminModelDatasets).mockResolvedValue({ ok: true, datasets: [dataset] });
    vi.mocked(api.adminRegisteredModels).mockResolvedValue({ ok: true, models: [] });
    vi.mocked(api.trainAdminTensorflowDataset).mockResolvedValue({
      ok: true,
      model: null,
      promoted: false,
      productionEligible: false,
      split: { trainRows: 80, testRows: 20, trainGroups: 8, testGroups: 2 },
      candidate: { rows: 20, mae: 2, rmse: 2.5, rSquared: 0.8 },
      baseline: { rows: 20, mae: 3, rmse: 3.5, rSquared: 0.6 },
      reason: "Synthetic experiments cannot be promoted.",
      message: "Training completed.",
    });
  });

  it("loads registered datasets and runs training from the workspace", async () => {
    render(<AdminModelsPage />);
    expect(await screen.findByText("student-score-fixture")).toBeTruthy();
    const trainButton = await screen.findByRole("button", { name: "Train candidate" });
    fireEvent.click(trainButton);

    await waitFor(() => {
      expect(api.trainAdminTensorflowDataset).toHaveBeenCalledWith("dataset-1", {
        modelId: "student-score-population",
        epochs: 80,
        batchSize: 32,
        seed: 42,
      });
    });
    expect(await screen.findByText("Latest training report")).toBeTruthy();
    expect(screen.getByText("Candidate MAE")).toBeTruthy();
    expect(screen.getByText("No model artifact registered")).toBeTruthy();
  });
});
