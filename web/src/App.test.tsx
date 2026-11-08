import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("live Vite application", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads published announcements into the student dashboard and announcements view", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(response(200, {
          user: { id: 4, email: "student@example.com", role: "STUDENT" },
        }));
      }
      if (path.endsWith("/bank")) {
        return Promise.resolve(response(200, { total: 1, subjects: [{ subject: "Maths", count: 1, topics: [{ topic: "Algebra", count: 1 }] }] }));
      }
      if (path.endsWith("/announcements/notice-1/read")) {
        return Promise.resolve(response(200, { ok: true, seenAt: "2026-11-08T09:00:00.000Z" }));
      }
      if (path.endsWith("/announcements")) {
        return Promise.resolve(response(200, {
          announcements: [{
            id: "notice-1",
            title: "ECET mock exam schedule",
            message: "The mock exam starts tomorrow at 10 AM.",
            createdAt: "2026-11-08T08:00:00.000Z",
            publishedAt: "2026-11-08T08:00:00.000Z",
            expiresAt: null,
          }],
        }));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);

    const popup = await screen.findByRole("dialog", { name: "ECET mock exam schedule" });
    expect(within(popup).getByText("The mock exam starts tomorrow at 10 AM.")).toBeInTheDocument();

    fireEvent.click(within(popup).getByRole("button", { name: /Got it/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/announcements/notice-1/read"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Announcements/ }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Announcements" })).toBeInTheDocument();
    });
    expect(screen.getByText("ECET mock exam schedule")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/announcements"))).toBe(true);
  });
  it("lets an administrator add a question and build a mock exam from it", async () => {
    const createdQuestion = {
      id: 91,
      subject: "Computer Science",
      topic: "Data Structures",
      text: "Which data structure follows FIFO order?",
      options: ["Stack", "Queue", "Tree", "Graph"],
      difficulty: "medium",
    };
    let examPayload: Record<string, unknown> | null = null;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(response(200, {
          user: { id: 1, email: "admin@example.com", role: "ADMIN" },
        }));
      }
      if (path.endsWith("/admin/question-bank")) {
        return Promise.resolve(response(200, { questions: [] }));
      }
      if (path.endsWith("/admin/questions")) {
        return Promise.resolve(response(201, { ok: true, question: createdQuestion }));
      }
      if (path.endsWith("/admin/exams") && init?.method === "POST") {
        examPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Promise.resolve(response(201, { ok: true }));
      }
      if (path.endsWith("/admin/exams")) {
        return Promise.resolve(response(200, { exams: [] }));
      }
      if (path.endsWith("/admin/students")) {
        return Promise.resolve(response(200, { students: [] }));
      }
      if (path.endsWith("/admin/analytics/overview")) {
        return Promise.resolve(response(200, {
          totals: { students: 0, exams: 0, assignments: 0, submissions: 0, submissionRate: 0, averagePercentage: null },
          exams: [],
          recentSubmissions: [],
        }));
      }
      if (path.endsWith("/auth/invitations")) {
        return Promise.resolve(response(200, { invitations: [] }));
      }
      if (path.endsWith("/admin/announcements")) {
        return Promise.resolve(response(200, { announcements: [] }));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Question bank" }));

    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Computer Science" } });
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Data Structures" } });
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: createdQuestion.text } });
    createdQuestion.options.forEach((option, index) => {
      fireEvent.change(screen.getByLabelText(`Option ${String.fromCharCode(65 + index)}`), {
        target: { value: option },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Add question to bank" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Question added to the question bank.");
    expect(screen.getAllByText(createdQuestion.text).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Exams" }));
    fireEvent.change(screen.getByLabelText("Exam title"), { target: { value: "CSE Mock Test 01" } });
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Which data structure follows FIFO order/ }));
    fireEvent.change(screen.getByLabelText("Marks per question"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Negative marks per wrong answer"), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Create draft/ }));

    await waitFor(() => expect(examPayload).not.toBeNull());
    expect(examPayload).toMatchObject({
      title: "CSE Mock Test 01",
      durationMinutes: 90,
      questions: [{ questionId: 91, marks: 2, negativeMarks: 0.5 }],
    });
  });


  it("builds a student paper by selected subjects with optional subject-scoped topics", async () => {
    let paperPayload: Record<string, unknown> | null = null;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) return Promise.resolve(response(200, { user: { id: 4, email: "student@example.com", role: "STUDENT" } }));
      if (path.endsWith("/bank")) return Promise.resolve(response(200, {
        total: 5,
        subjects: [
          { subject: "Maths", count: 3, topics: [{ topic: "Algebra", count: 2 }, { topic: "Calculus", count: 1 }] },
          { subject: "Physics", count: 2, topics: [{ topic: "Algebra", count: 2 }] },
        ],
      }));
      if (path.endsWith("/exams/assigned")) return Promise.resolve(response(200, { assignments: [] }));
      if (path.endsWith("/announcements")) return Promise.resolve(response(200, { announcements: [] }));
      if (path.endsWith("/tests") && init?.method === "POST") {
        paperPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Promise.resolve(response(201, { attemptId: 12, mode: "practice", deadline: null, warnings: [], questions: [{ id: 1, subject: "Maths", topic: "Algebra", text: "Question?", options: ["A", "B", "C", "D"] }] }));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Practice" }));
    fireEvent.click(screen.getByLabelText(/Maths/));
    fireEvent.click(screen.getByLabelText(/Physics/));
    fireEvent.click(screen.getAllByLabelText(/Algebra/)[0]);
    fireEvent.change(screen.getByLabelText("Number of questions"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Difficulty"), { target: { value: "easy" } });
    fireEvent.click(screen.getByRole("button", { name: "Create 5-question paper" }));

    await waitFor(() => expect(paperPayload).not.toBeNull());
    expect(paperPayload).toMatchObject({
      mode: "practice",
      subjects: ["Maths", "Physics"],
      topicFilters: [{ subject: "Maths", topic: "Algebra" }],
      count: 5,
      difficulty: "easy",
    });
  });

});
