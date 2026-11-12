import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

vi.mock("./offlineStore", () => ({
  getPendingSubmissions: vi.fn(),
  keepSubmissionPending: vi.fn(),
  markSubmissionSynced: vi.fn(),
}));

import { syncPendingSubmissions } from "./offlineSync";
import {
  getPendingSubmissions,
  keepSubmissionPending,
  markSubmissionSynced,
} from "./offlineStore";

const mockedGetPending = vi.mocked(getPendingSubmissions);
const mockedKeepPending = vi.mocked(keepSubmissionPending);
const mockedMarkSynced = vi.mocked(markSubmissionSynced);

const attempt = {
  assignmentId: "assignment-1",
  attemptUuid: "attempt-uuid",
  startedAt: new Date(Date.now() - 100000).toISOString(),
  submittedAt: new Date().toISOString(),
  answers: [{ examQuestionId: "q1", selectedIndex: 1 }],
};

describe("offlineSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads a pending submission and marks it synced", async () => {
    mockedGetPending.mockResolvedValue([attempt]);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submission: { id: "sub-1", attemptUuid: "attempt-uuid" } }),
    } as Response);

    const result = await syncPendingSubmissions("https://api.example.com", "token-abc");

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockedMarkSynced).toHaveBeenCalledWith("assignment-1", "sub-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/exams/assignments/assignment-1/submission",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer token-abc" }) }),
    );
  });

  it("keeps a submission pending when the server rejects it", async () => {
    mockedGetPending.mockResolvedValue([attempt]);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "Bad submission" }),
    } as Response);

    const result = await syncPendingSubmissions("https://api.example.com", "token-abc");

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(mockedKeepPending).toHaveBeenCalledWith("assignment-1", expect.stringContaining("Bad submission"));
  });

  it("stops on auth/server failures", async () => {
    mockedGetPending.mockResolvedValue([attempt, { ...attempt, assignmentId: "assignment-2" }]);
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ submission: { id: "sub-2", attemptUuid: "attempt-uuid" } }),
      } as Response);

    const result = await syncPendingSubmissions("https://api.example.com", "token-abc");

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    // Second submission should not be attempted after a 401.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("handles network failure gracefully", async () => {
    mockedGetPending.mockResolvedValue([attempt]);
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network down"));

    const result = await syncPendingSubmissions("https://api.example.com", "token-abc");

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(mockedKeepPending).toHaveBeenCalledWith("assignment-1", "Network down");
  });
});
