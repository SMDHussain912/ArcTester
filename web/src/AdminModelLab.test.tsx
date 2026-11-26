import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminModelLab from "./AdminModelLab";

const snapshot = {
  datasets: [{ id: "dataset-1", name: "Readiness training", task: "classification", targetColumn: "label", rowCount: 20, sourceDescription: "Synthetic rows for tests.", sourceAttested: false, datasetKind: "synthetic", fingerprint: "a".repeat(64), createdAt: "2026-11-26T00:00:00.000Z" }],
  jobs: [],
  models: [{ id: "model-1", modelId: "readiness_classifier", version: 1, algorithm: "logistic_regression", task: "classification", dataset: "Readiness training", trainingDatasetId: "dataset-1", isActive: false, createdAt: "2026-11-26T00:00:00.000Z", activatedAt: null }],
  evaluations: [],
  drift: [],
};
function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Admin Model Lab", () => {
  it("keeps analytics model management separate and supports activate, edit and delete candidate actions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin/model-lab" && (!init?.method || init.method === "GET")) return response(snapshot);
      if (url.pathname.endsWith("/activate")) return response({ ok: true });
      if (init?.method === "PATCH") return response({ ok: true, model: { modelId: "readiness_classifier_v2", version: 1 } });
      if (init?.method === "DELETE") return response({ ok: true });
      return response({ ok: true }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "prompt").mockReturnValue("readiness_classifier_v2");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminModelLab />);

    expect(await screen.findByRole("heading", { name: "Model Lab" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create dataset" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Train a model" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Models & versions" })).toBeInTheDocument();
    expect(screen.getByText(/analytics model workspace—not API Handling/i)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Select active version" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/admin/model-lab/models/readiness_classifier/1/activate"), expect.objectContaining({ method: "POST" })));

    fireEvent.click(screen.getByRole("button", { name: "Edit model ID" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/admin/model-lab/models/readiness_classifier/1"), expect.objectContaining({ method: "PATCH" })));

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/admin/model-lab/models/readiness_classifier/1"), expect.objectContaining({ method: "DELETE" })));
  });
});
