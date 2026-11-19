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

  it("stops the queue when the server rate-limits submissions", async () => {
    mockedGetPending.mockResolvedValue([attempt, { ...attempt, assignmentId: "assignment-2" }]);
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: "Too many requests" }),
      } as Response);

    const result = await syncPendingSubmissions("https://api.example.com", "token-abc");

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockedKeepPending).toHaveBeenCalledWith("assignment-1", expect.stringContaining("Too many requests"));
  });

  it("handles network failure gracefully", async () => {
    mockedGetPending.mockResolvedValue([attempt]);
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network down"));

    const result = await syncPendingSubmissions("https://api.example.com", "token-abc");

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(mockedKeepPending).toHaveBeenCalledWith("assignment-1", "Network down");
  });
  it("shares one in-flight queue drain when sync is triggered concurrently", async () => {
    mockedGetPending.mockResolvedValue([attempt]);
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(response);

    const first = syncPendingSubmissions("https://api.example.com", "token-abc");
    const second = syncPendingSubmissions("https://api.example.com", "token-abc");

    expect(second).toBe(first);
    await Promise.resolve();
    expect(mockedGetPending).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveResponse({
      ok: true,
      json: async () => ({ submission: { id: "sub-concurrent", attemptUuid: "attempt-uuid" } }),
    } as Response);

    const results = await Promise.all([first, second]);
    expect(results[0]).toEqual({ uploaded: 1, failed: 0, remaining: 0 });
    expect(results[1]).toEqual(results[0]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockedMarkSynced).toHaveBeenCalledTimes(1);
  });

  it("recovers when the server accepted a submission but the response was lost", async () => {
    mockedGetPending.mockResolvedValue([attempt]);
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("Connection reset after request was sent"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          duplicate: true,
          submission: { id: "sub-already-created", attemptUuid: attempt.attemptUuid },
        }),
      } as Response);

    const first = await syncPendingSubmissions("https://api.example.com/", "token-abc");
    expect(first).toEqual({ uploaded: 0, failed: 1, remaining: 1 });
    expect(mockedKeepPending).toHaveBeenCalledWith(
      attempt.assignmentId,
      "Connection reset after request was sent"
    );
    expect(mockedMarkSynced).not.toHaveBeenCalled();

    mockedGetPending.mockResolvedValue([attempt]);
    const second = await syncPendingSubmissions("https://api.example.com", "token-abc");
    expect(second).toEqual({ uploaded: 1, failed: 0, remaining: 0 });
    expect(mockedMarkSynced).toHaveBeenCalledWith(attempt.assignmentId, "sub-already-created");

    const requests = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(requests).toHaveLength(2);
    const firstBody = JSON.parse(requests[0][1].body as string);
    const retryBody = JSON.parse(requests[1][1].body as string);
    expect(retryBody).toEqual(firstBody);
    expect(retryBody.attemptUuid).toBe(attempt.attemptUuid);
  });

  it("keeps a submission pending when the server omits the attempt identifier", async () => {
    mockedGetPending.mockResolvedValue([attempt]);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submission: { id: "sub-missing-uuid" } }),
    } as Response);

    const result = await syncPendingSubmissions("https://api.example.com", "token-abc");

    expect(result).toEqual({ uploaded: 0, failed: 1, remaining: 1 });
    expect(mockedKeepPending).toHaveBeenCalledWith(
      "assignment-1",
      expect.stringContaining("different attempt identifier")
    );
    expect(mockedMarkSynced).not.toHaveBeenCalled();
  });

  it("keeps a submission pending when the server returns another attempt identifier", async () => {
    mockedGetPending.mockResolvedValue([attempt]);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ submission: { id: "sub-wrong-uuid", attemptUuid: "another-attempt" } }),
    } as Response);

    const result = await syncPendingSubmissions("https://api.example.com", "token-abc");

    expect(result).toEqual({ uploaded: 0, failed: 1, remaining: 1 });
    expect(mockedKeepPending).toHaveBeenCalledWith(
      "assignment-1",
      expect.stringContaining("different attempt identifier")
    );
    expect(mockedMarkSynced).not.toHaveBeenCalled();
  });

});
