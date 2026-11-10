import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminWorkspace from "./AdminWorkspace";

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("administrator question bank", () => {
  it("does not let an older search response overwrite the latest filters", async () => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin/questions") {
        const query = url.searchParams.get("q");
        if (query === "older") return older.promise;
        if (query === "newer") return newer.promise;
        return Promise.resolve(response({ questions: [], total: 0, pages: 1 }));
      }
      if (url.pathname === "/admin/question-catalog") {
        return Promise.resolve(response({ subjects: [] }));
      }
      if (url.pathname === "/admin/exams") return Promise.resolve(response({ exams: [] }));
      if (url.pathname === "/admin/students") return Promise.resolve(response({ students: [] }));
      if (url.pathname === "/admin/exam-results") return Promise.resolve(response({ results: [] }));
      if (url.pathname === "/admin/announcements") return Promise.resolve(response({ announcements: [] }));
      return Promise.resolve(response({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminWorkspace
      email="admin@example.com"
      theme="light"
      setTheme={vi.fn()}
      signOut={vi.fn()}
      invitations={[]}
      createInvitation={vi.fn()}
      inviteEmail=""
      setInviteEmail={vi.fn()}
      createdInvitation={null}
      revokeInvitation={vi.fn()}
      busy={false}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Question bank" }));
    const search = screen.getByPlaceholderText("Search question text or explanation…");
    fireEvent.change(search, { target: { value: "older" } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) =>
      new URL(String(input)).searchParams.get("q") === "older"
    )).toBe(true));

    fireEvent.change(search, { target: { value: "newer" } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) =>
      new URL(String(input)).searchParams.get("q") === "newer"
    )).toBe(true));

    const makeQuestion = (id: number, text: string) => ({
      id, subject: "Maths", topic: "Algebra", text,
      options: ["A", "B", "C", "D"], correctIndex: 0,
      explanation: "", source: "", difficulty: "easy",
    });
    newer.resolve(response({ questions: [makeQuestion(2, "Newest matching question")], total: 1, pages: 1 }));
    expect(await screen.findByText("Newest matching question")).toBeInTheDocument();

    older.resolve(response({ questions: [makeQuestion(1, "Stale matching question")], total: 1, pages: 1 }));
    await waitFor(() => expect(screen.queryByText("Stale matching question")).not.toBeInTheDocument());
    expect(screen.getByText("Newest matching question")).toBeInTheDocument();
  });

  it("shows live candidate connectivity and integrity signals in the invigilation monitor", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/admin/question-catalog") return Promise.resolve(response({ subjects: [] }));
      if (path === "/admin/questions") return Promise.resolve(response({ questions: [], total: 0 }));
      if (path === "/admin/exams") return Promise.resolve(response({ exams: [] }));
      if (path === "/admin/students") return Promise.resolve(response({ students: [] }));
      if (path === "/admin/exam-results") return Promise.resolve(response({ results: [] }));
      if (path === "/admin/announcements") return Promise.resolve(response({ announcements: [] }));
      if (path === "/admin/exams/live-sessions") return Promise.resolve(response({
        ok: true,
        serverTime: "2026-11-10T06:00:00.000Z",
        total: 2,
        sessions: [
          {
            id: "session-connected",
            status: "ACTIVE",
            student: { id: 7, email: "connected@example.com" },
            exam: { id: "exam-1", title: "ECET Mock 01" },
            assignmentId: "assignment-1",
            startedAt: "2026-11-10T05:30:00.000Z",
            lastHeartbeatAt: "2026-11-10T05:59:55.000Z",
            connectivity: "CONNECTED",
            heartbeatCount: 42,
            focusLossCount: 1,
            disconnectCount: 0,
            submission: null,
            events: [{ id: "event-1", type: "FOCUS_LOST", detail: "", createdAt: "2026-11-10T05:55:00.000Z", actor: null }],
          },
          {
            id: "session-stale",
            status: "INTERRUPTED",
            student: { id: 8, email: "stale@example.com" },
            exam: { id: "exam-2", title: "ECET Mock 02" },
            assignmentId: "assignment-2",
            startedAt: "2026-11-10T05:00:00.000Z",
            lastHeartbeatAt: "2026-11-10T05:10:00.000Z",
            connectivity: "STALE",
            heartbeatCount: 12,
            focusLossCount: 0,
            disconnectCount: 2,
            submission: { id: "submission-2", status: "REVIEW_REQUIRED" },
            events: [],
          },
        ],
      }));
      return Promise.resolve(response({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminWorkspace
      email="admin@example.com"
      theme="light"
      setTheme={vi.fn()}
      signOut={vi.fn()}
      invitations={[]}
      createInvitation={vi.fn()}
      inviteEmail=""
      setInviteEmail={vi.fn()}
      createdInvitation={null}
      revokeInvitation={vi.fn()}
      busy={false}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Live invigilation" }));
    expect(await screen.findByText("connected@example.com")).toBeInTheDocument();
    expect(screen.getByText("stale@example.com")).toBeInTheDocument();
    expect(screen.getByText("CONNECTED")).toBeInTheDocument();
    expect(screen.getByText("STALE")).toBeInTheDocument();
    expect(screen.getByText("ECET Mock 01")).toBeInTheDocument();
    expect(screen.getByText("Submission: REVIEW_REQUIRED")).toBeInTheDocument();
    expect(screen.getByText("Focus losses + disconnects")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).pathname === "/admin/exams/live-sessions")).toBe(true);
  });
});
