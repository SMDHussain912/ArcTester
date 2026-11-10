import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssignedExams from "./AssignedExams";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("assigned exam server session client", () => {
  const fetchMock = vi.fn();
  const session = {
    id: "session-1",
    status: "ACTIVE",
    startedAt: "2026-11-10T10:00:00.000Z",
    serverTime: "2026-11-10T10:00:00.000Z",
    deadline: "2026-11-10T11:00:00.000Z",
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/exams/assigned")) {
        return jsonResponse({ assignments: [{ id: "assignment-1", status: "ASSIGNED", assignedAt: session.serverTime, availableFrom: null, dueAt: null, exam: { id: "exam-1", title: "Lifecycle test", description: "" }, version: 1, durationMinutes: 60, questionCount: 1, submission: null }] });
      }
      if (path.endsWith("/package")) {
        return jsonResponse({ package: { assignmentId: "assignment-1", title: "Lifecycle test", description: "", version: 1, instructions: "", durationMinutes: 60, serverTime: session.serverTime, questions: [{ id: "question-1", position: 0, subject: "CSE", topic: null, text: "Choose one", options: ["A", "B", "C", "D"], optionOrder: [0, 1, 2, 3], marks: 2, negativeMarks: 0 }] } });
      }
      if (path.endsWith("/session/start")) return jsonResponse({ session });
      if (path.endsWith("/answers") && (!init || init.method === undefined || init.method === "GET")) return jsonResponse({ revision: 0, answers: [] });
      if (path.endsWith("/answers") && init?.method === "PUT") return jsonResponse({ revision: 1 });
      if (path.endsWith("/session/heartbeat")) return jsonResponse({ serverTime: session.serverTime, deadline: session.deadline, sessionStatus: "ACTIVE" });
      if (path.endsWith("/submission")) return jsonResponse({ error: "offline" }, 503);
      if (path.endsWith("/result")) return jsonResponse({ result: { status: "GRADED", score: 2, maximumScore: 2, questions: [] } });
      return jsonResponse({});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts through the server session endpoint and uses its start/deadline", async () => {
    render(<AssignedExams />);
    fireEvent.click(await screen.findByRole("button", { name: /Start exam/ }));
    expect(await screen.findByText("Choose one")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/session/start") && init?.method === "POST")).toBe(true);
    expect(screen.getByText("60:00")).toBeInTheDocument();
  });

  it("sends a heartbeat every 15 seconds while the exam is active", async () => {
    render(<AssignedExams />);
    fireEvent.click(await screen.findByRole("button", { name: /Start exam/ }));
    await screen.findByText("Choose one");
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/session/heartbeat"))).toHaveLength(1);
  });

  it("retains local answers and allows an idempotent retry after temporary offline submission failure", async () => {
    let failedOnce = false;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/exams/assigned")) return jsonResponse({ assignments: [{ id: "assignment-1", status: "ASSIGNED", assignedAt: session.serverTime, availableFrom: null, dueAt: null, exam: { id: "exam-1", title: "Lifecycle test", description: "" }, version: 1, durationMinutes: 60, questionCount: 1, submission: null }] });
      if (path.endsWith("/package")) return jsonResponse({ package: { assignmentId: "assignment-1", title: "Lifecycle test", description: "", version: 1, instructions: "", durationMinutes: 60, serverTime: session.serverTime, questions: [{ id: "question-1", position: 0, subject: "CSE", topic: null, text: "Choose one", options: ["A", "B", "C", "D"], optionOrder: [0, 1, 2, 3], marks: 2, negativeMarks: 0 }] } });
      if (path.endsWith("/session/start")) return jsonResponse({ session });
      if (path.endsWith("/answers") && (!init || init.method === undefined || init.method === "GET")) return jsonResponse({ revision: 0, answers: [] });
      if (path.endsWith("/answers") && init?.method === "PUT") return jsonResponse({ revision: 1 });
      if (path.endsWith("/submission")) {
        if (!failedOnce) { failedOnce = true; throw new TypeError("Failed to fetch"); }
        return jsonResponse({ submission: { id: "submission-1" } }, 201);
      }
      if (path.endsWith("/result")) return jsonResponse({ result: { status: "GRADED", score: 2, maximumScore: 2, questions: [] } });
      return jsonResponse({});
    });
    render(<AssignedExams />);
    fireEvent.click(await screen.findByRole("button", { name: /Start exam/ }));
    await screen.findByText("Choose one");
    fireEvent.click(screen.getByRole("button", { name: /A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit exam" }));
    expect(await screen.findByText("Could not reach the server. Your answers are saved on this device. Press Retry submission when you are back online.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry submission" }));
    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());
  });
  it("holds the timer while paused and automatically resumes after the administrator resumes the session", async () => {
    let resumed = false;
    let startCalls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/exams/assigned")) return jsonResponse({ assignments: [{ id: "assignment-1", status: "ASSIGNED", assignedAt: session.serverTime, availableFrom: null, dueAt: null, exam: { id: "exam-1", title: "Lifecycle test", description: "" }, version: 1, durationMinutes: 60, questionCount: 1, submission: null }] });
      if (path.endsWith("/package")) return jsonResponse({ package: { assignmentId: "assignment-1", title: "Lifecycle test", description: "", version: 1, instructions: "", durationMinutes: 60, serverTime: session.serverTime, questions: [{ id: "question-1", position: 0, subject: "CSE", topic: null, text: "Choose one", options: ["A", "B", "C", "D"], optionOrder: [0, 1, 2, 3], marks: 2, negativeMarks: 0 }] } });
      if (path.endsWith("/session/start")) {
        startCalls += 1;
        if (startCalls === 1 || resumed) return jsonResponse({ session: { ...session, serverTime: "2026-11-10T10:00:30.000Z", deadline: "2026-11-10T11:00:30.000Z" } });
        return jsonResponse({ error: "The exam session is paused." }, 409);
      }
      if (path.endsWith("/answers") && (!init || init.method === undefined || init.method === "GET")) return jsonResponse({ revision: 0, answers: [] });
      if (path.endsWith("/answers") && init?.method === "PUT") return jsonResponse({ revision: 1 });
      if (path.endsWith("/session/heartbeat")) return jsonResponse({ error: "There is no active exam session." }, 409);
      return jsonResponse({});
    });
    render(<AssignedExams />);
    fireEvent.click(await screen.findByRole("button", { name: /Start exam/ }));
    await screen.findByText("Choose one");
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText(/Paused by invigilator/)).toBeInTheDocument();
    const held = screen.getByText(/Paused by invigilator/).textContent;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByText(/Paused by invigilator/).textContent).toBe(held);
    resumed = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    await waitFor(() => expect(screen.queryByText(/Paused by invigilator/)).not.toBeInTheDocument());
    expect(startCalls).toBeGreaterThanOrEqual(2);
  });

  it("caps failed automatic submission at five retries with exponential backoff", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/exams/assigned")) return jsonResponse({ assignments: [{ id: "assignment-1", status: "ASSIGNED", assignedAt: session.serverTime, availableFrom: null, dueAt: null, exam: { id: "exam-1", title: "Lifecycle test", description: "" }, version: 1, durationMinutes: 60, questionCount: 1, submission: null }] });
      if (path.endsWith("/package")) return jsonResponse({ package: { assignmentId: "assignment-1", title: "Lifecycle test", description: "", version: 1, instructions: "", durationMinutes: 60, serverTime: session.serverTime, questions: [{ id: "question-1", position: 0, subject: "CSE", topic: null, text: "Choose one", options: ["A", "B", "C", "D"], optionOrder: [0, 1, 2, 3], marks: 2, negativeMarks: 0 }] } });
      if (path.endsWith("/session/start")) return jsonResponse({ session: { ...session, serverTime: "2026-11-10T10:00:00.000Z", deadline: "2026-11-10T09:59:59.000Z" } });
      if (path.endsWith("/answers")) return jsonResponse({ revision: 0, answers: [] });
      if (path.endsWith("/submission")) throw new TypeError("Failed to fetch");
      return jsonResponse({});
    });
    render(<AssignedExams />);
    fireEvent.click(await screen.findByRole("button", { name: /Start exam/ }));
    await screen.findByText("Choose one");
    await act(async () => { await vi.advanceTimersByTimeAsync(32_000); });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/submission"))).toHaveLength(6);
    expect(screen.getByText("Could not reach the server. Your answers are saved on this device. Press Retry submission when you are back online.")).toBeInTheDocument();
  });

  it.each([403, 409])("stops automatic submission immediately on HTTP %i and shows the server message", async (status) => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/exams/assigned")) return jsonResponse({ assignments: [{ id: "assignment-1", status: "ASSIGNED", assignedAt: session.serverTime, availableFrom: null, dueAt: null, exam: { id: "exam-1", title: "Lifecycle test", description: "" }, version: 1, durationMinutes: 60, questionCount: 1, submission: null }] });
      if (path.endsWith("/package")) return jsonResponse({ package: { assignmentId: "assignment-1", title: "Lifecycle test", description: "", version: 1, instructions: "", durationMinutes: 60, serverTime: session.serverTime, questions: [{ id: "question-1", position: 0, subject: "CSE", topic: null, text: "Choose one", options: ["A", "B", "C", "D"], optionOrder: [0, 1, 2, 3], marks: 2, negativeMarks: 0 }] } });
      if (path.endsWith("/session/start")) return jsonResponse({ session: { ...session, serverTime: "2026-11-10T10:00:00.000Z", deadline: "2026-11-10T10:00:00.000Z" } });
      if (path.endsWith("/answers")) return jsonResponse({ revision: 0, answers: [] });
      if (path.endsWith("/submission")) return jsonResponse({ error: status === 403 ? "Forbidden by administrator." : "The examination time has expired." }, status);
      return jsonResponse({});
    });
    render(<AssignedExams />);
    fireEvent.click(await screen.findByRole("button", { name: /Start exam/ }));
    await screen.findByText("Choose one");
    await waitFor(() => expect(screen.getByText(status === 403 ? "Forbidden by administrator." : "The examination time has expired.")).toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/submission"))).toHaveLength(1);
    expect(screen.getByText(status === 403 ? "Forbidden by administrator." : "The examination time has expired.")).toBeInTheDocument();
  });

});
