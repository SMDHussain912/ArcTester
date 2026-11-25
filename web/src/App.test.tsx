import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
  let localStorageValues = new Map<string, string>();

  beforeEach(() => {
    fetchMock.mockReset();
    localStorageValues = new Map();
    vi.stubGlobal("localStorage", {
      get length() { return localStorageValues.size; },
      key: vi.fn((index: number) => [...localStorageValues.keys()][index] ?? null),
      getItem: vi.fn((key: string) => localStorageValues.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { localStorageValues.set(key, value); }),
      removeItem: vi.fn((key: string) => { localStorageValues.delete(key); }),
      clear: vi.fn(() => { localStorageValues.clear(); }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      if (path.endsWith("/announcements/notice-1/acknowledge")) {
        return Promise.resolve(response(200, { ok: true, seenAt: "2026-11-08T09:00:00.000Z" }));
      }
      if (path.endsWith("/announcements/active") || path.endsWith("/announcements")) {
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

    const popup = (await screen.findAllByRole("dialog", { name: "ECET mock exam schedule" }))[0];
    expect(within(popup).getByText("The mock exam starts tomorrow at 10 AM.")).toBeInTheDocument();

    fireEvent.click(within(popup).getByRole("button", { name: /Got it/ }));
    await waitFor(() => expect(document.querySelector('[aria-labelledby="announcement-popup-title"]')).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/announcements/notice-1/acknowledge"))).toBe(true);

    fireEvent.click(within(await screen.findByRole("complementary", { name: "Student workspace" })).getByRole("button", { name: /Announcements/ }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Announcements" })).toBeInTheDocument();
    });
    expect(screen.getAllByText("ECET mock exam schedule").length).toBeGreaterThan(0);
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
      if (path.includes("/admin/question-bank")) {
        return Promise.resolve(response(200, { questions: [] }));
      }
      if (path.includes("/admin/questions?")) {
        return Promise.resolve(response(200, { questions: [createdQuestion], total: 1 }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Add question" }));

    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Computer Science" } });
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Data Structures" } });
    fireEvent.change(screen.getByLabelText("Question text"), { target: { value: createdQuestion.text } });
    createdQuestion.options.forEach((option, index) => {
      fireEvent.change(screen.getByLabelText(`Option ${String.fromCharCode(65 + index)}`), {
        target: { value: option },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to question bank" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Question added to the bank.");
    expect(screen.getAllByText(createdQuestion.text).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Mock test builder" }));
    fireEvent.change(screen.getByLabelText("Test title"), { target: { value: "CSE Mock Test 01" } });
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Which data structure follows FIFO order/ }));
    fireEvent.change(screen.getByLabelText("Marks per question"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Negative marks"), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Save draft exam/ }));

    await waitFor(() => expect(examPayload).not.toBeNull());
    expect(examPayload).toMatchObject({
      title: "CSE Mock Test 01",
      durationMinutes: 90,
      questions: [{ questionId: 91, marks: 2, negativeMarks: 0.5 }],
    });
  });


  it("shows and releases a submission from the dedicated admin review queue", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let released = false;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) return Promise.resolve(response(200, {
        user: { id: 1, email: "admin@example.com", role: "ADMIN" },
      }));
      if (path.includes("/admin/question-bank")) return Promise.resolve(response(200, { questions: [] }));
      if (path.endsWith("/auth/invitations")) return Promise.resolve(response(200, { invitations: [] }));
      if (path.endsWith("/admin/announcements")) return Promise.resolve(response(200, { announcements: [] }));
      if (path.endsWith("/admin/subjects")) return Promise.resolve(response(200, { subjects: [] }));
      if (path.endsWith("/admin/exams")) return Promise.resolve(response(200, { exams: [] }));
      if (path.includes("/admin/students?")) return Promise.resolve(response(200, { students: [], total: 0 }));
      if (path.includes("/admin/exams/live-sessions")) return Promise.resolve(response(200, { sessions: [], total: 0 }));
      if (path.includes("/admin/exams/attendance")) return Promise.resolve(response(200, { attendance: [], total: 0 }));
      if (path.endsWith("/admin/analytics/overview")) return Promise.resolve(response(200, {
        totals: { students: 1, exams: 1, assignments: 1, submissions: 1, reviewRequired: released ? 0 : 1, submissionRate: 1, averagePercentage: null },
        exams: [],
        recentSubmissions: [],
      }));
      if (path.includes("/admin/submissions/review-required")) return Promise.resolve(response(200, {
        submissions: released ? [] : [{
          submissionId: "submission-review-1",
          assignmentId: "assignment-1",
          studentId: 7,
          studentEmail: "learner@example.com",
          examTitle: "ECET Mock 01",
          submittedAt: "2026-11-08T10:00:00.000Z",
          receivedAt: "2026-11-08T10:00:02.000Z",
          score: 8,
          maximumScore: 10,
        }],
        page: 1, limit: 25, total: released ? 0 : 1, totalPages: released ? 0 : 1,
      }));
      if (path.endsWith("/admin/submissions/submission-review-1/release") && init?.method === "POST") {
        released = true;
        return Promise.resolve(response(200, { ok: true, status: "GRADED" }));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Review queue/ }));
    expect(await screen.findByText(/learner@example.com/)).toBeInTheDocument();
    expect(screen.getByText("ECET Mock 01")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve & release" }));
    await waitFor(() => expect(screen.getByText("No submissions are waiting for review.")).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).endsWith("/admin/submissions/submission-review-1/release") && init?.method === "POST"
    )).toBe(true);
  });

  it("restores an in-progress practice attempt and saved answers after reload", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => key === "arctester-active-practice-attempt" ? "42" : key === "arctester-practice-answers-42" ? JSON.stringify({ "7": 1, "8": 9, "999": 0 }) : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) return Promise.resolve(response(200, { user: { id: 4, email: "student@example.com", role: "STUDENT" } }));
      if (path.endsWith("/tests/42")) return Promise.resolve(response(200, {
        attemptId: 42,
        mode: "practice",
        deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        serverNow: "2026-11-08T11:00:00.000Z",
        questions: [
          { id: 7, subject: "Maths", topic: "Algebra", text: "Restored question?", options: ["A", "B", "C", "D"] },
          { id: 8, subject: "Maths", topic: "Algebra", text: "Second restored question?", options: ["A", "B", "C", "D"] },
        ],
        saved: [{ questionId: 7, selectedIndex: null }],
      }));
      if (path.endsWith("/bank")) return Promise.resolve(response(200, { total: 1, subjects: [{ subject: "Maths", count: 1, topics: [{ topic: "Algebra", count: 1 }] }] }));
      if (path.endsWith("/exams/assigned")) return Promise.resolve(response(200, { assignments: [] }));
      if (path.endsWith("/announcements")) return Promise.resolve(response(200, { announcements: [] }));
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    expect(await screen.findByText("Restored question?")).toBeInTheDocument();
    const restoredQuestion = screen.getByText("Restored question?").closest("article");
    const restoredSelectedOption = within(restoredQuestion!).getAllByRole("button").find((button) => button.getAttribute("aria-pressed") === "true");
    expect(restoredSelectedOption).toBeDefined();
    expect(restoredSelectedOption).toHaveClass("selected");
    expect(await screen.findByText("Second restored question?")).toBeInTheDocument();
    const secondQuestion = screen.getByText("Second restored question?").closest("article");
    expect(within(secondQuestion!).getAllByRole("button").every((button) => !button.classList.contains("selected"))).toBe(true);
    expect(screen.getByText(/1 \/ 2 answered/)).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "arctester-practice-answers-42",
        newValue: JSON.stringify({ "7": 1, "8": 2, "999": 0 }),
      }));
    });
    const updatedSelectedOption = within(secondQuestion!).getAllByRole("button").find((button) => button.getAttribute("aria-pressed") === "true");
    expect(updatedSelectedOption).toBeDefined();
    expect(updatedSelectedOption).toHaveClass("selected");
    expect(screen.getByText(/2 \/ 2 answered/)).toBeInTheDocument();
  });

  it("preserves practice recovery data when restore fails because the network is unavailable", async () => {
    localStorageValues.set("arctester-active-practice-attempt", "42");
    localStorageValues.set("arctester-practice-answers-42", JSON.stringify({ "7": 2 }));
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) return Promise.resolve(response(200, {
        user: { id: 4, email: "student@example.com", role: "STUDENT" },
      }));
      if (path.endsWith("/tests/42")) return Promise.reject(new TypeError("Failed to fetch"));
      if (path.endsWith("/bank")) return Promise.resolve(response(200, { total: 0, subjects: [] }));
      if (path.endsWith("/exams/assigned")) return Promise.resolve(response(200, { assignments: [] }));
      if (path.endsWith("/announcements/active") || path.endsWith("/announcements")) {
        return Promise.resolve(response(200, { announcements: [] }));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    expect(await screen.findByText(/Your previous practice attempt could not be restored: Failed to fetch/)).toBeInTheDocument();
    expect(localStorageValues.get("arctester-active-practice-attempt")).toBe("42");
    expect(localStorageValues.get("arctester-practice-answers-42")).toBe(JSON.stringify({ "7": 2 }));
  });

  it("clears practice recovery data when the server confirms the attempt is unavailable", async () => {
    localStorageValues.set("arctester-active-practice-attempt", "42");
    localStorageValues.set("arctester-practice-answers-42", JSON.stringify({ "7": 2 }));
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) return Promise.resolve(response(200, {
        user: { id: 4, email: "student@example.com", role: "STUDENT" },
      }));
      if (path.endsWith("/tests/42")) return Promise.resolve(response(404, { error: "Test not found." }));
      if (path.endsWith("/bank")) return Promise.resolve(response(200, { total: 0, subjects: [] }));
      if (path.endsWith("/exams/assigned")) return Promise.resolve(response(200, { assignments: [] }));
      if (path.endsWith("/announcements/active") || path.endsWith("/announcements")) {
        return Promise.resolve(response(200, { announcements: [] }));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    expect(await screen.findByText(/Your previous practice attempt could not be restored: Test not found/)).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorageValues.has("arctester-active-practice-attempt")).toBe(false);
      expect(localStorageValues.has("arctester-practice-answers-42")).toBe(false);
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
    fireEvent.click(screen.getByRole("checkbox", { name: /Maths 3 questions available/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Physics 2 questions available/ }));
    fireEvent.click(screen.getAllByLabelText(/Algebra/)[0]);
    fireEvent.change(screen.getByLabelText("Number of questions"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Difficulty"), { target: { value: "easy" } });
    fireEvent.click(screen.getByRole("button", { name: "Create 5-question paper" }));

    await waitFor(() => expect(paperPayload).not.toBeNull());
    expect(paperPayload).toMatchObject({
      mode: "practice",
      subjects: ["Maths", "Physics"],
      topicFilters: [{ subject: "Maths", topic: "Algebra" }],
      count: 4,
      difficulty: "easy",
      durationMinutes: 20,
      questionTypes: [],
    });
  });


  it("keeps the user signed in when server-side logout fails", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(response(200, {
          user: { id: 9, email: "learner@example.com", role: "STUDENT" },
        }));
      }
      if (path.endsWith("/bank")) {
        return Promise.resolve(response(200, { total: 0, subjects: [] }));
      }
      if (path.endsWith("/exams/assigned")) return Promise.resolve(response(200, { assignments: [] }));
      if (path.endsWith("/announcements")) return Promise.resolve(response(200, { announcements: [] }));
      if (path.endsWith("/auth/logout") && init?.method === "POST") {
        return Promise.resolve(response(503, { error: "Database temporarily unavailable." }));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    expect(await screen.findByText("learner@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText(/Secure sign-out failed/)).toBeInTheDocument();
    expect(screen.getByText("learner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice" })).toBeInTheDocument();
  });

  it("lets students switch tabs during a mock test and resume with answers intact", async () => {
    const createdTest = {
      attemptId: 880,
      mode: "mock",
      deadline: null,
      questions: [{
        id: 88,
        subject: "Computer Science",
        topic: "Data Structures",
        text: "Which structure follows FIFO?",
        options: ["Stack", "Queue", "Tree", "Graph"],
      }],
      warnings: [],
    };
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(response(200, {
          user: { id: 7, email: "learner@example.com", role: "STUDENT" },
        }));
      }
      if (path.endsWith("/bank")) {
        return Promise.resolve(response(200, {
          total: 1,
          subjects: [{ subject: "Computer Science", count: 1, topics: [{ topic: "Data Structures", count: 1 }] }],
        }));
      }
      if (path.endsWith("/tests") && init?.method === "POST") {
        return Promise.resolve(response(201, createdTest));
      }
      if (path.endsWith("/exams/assigned")) return Promise.resolve(response(200, { assignments: [] }));
      if (path.endsWith("/announcements")) return Promise.resolve(response(200, { announcements: [] }));
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Practice" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start mock test" }));
    const question = await screen.findByText("Which structure follows FIFO?");
    const questionCard = question.closest("article");
    expect(questionCard).not.toBeNull();
    fireEvent.click(within(questionCard!).getByRole("button", { name: /Queue/ }));

    fireEvent.click(screen.getByRole("button", { name: "Announcements" }));
    expect(await screen.findByRole("heading", { name: "Announcements" })).toBeInTheDocument();
    expect(screen.queryByText("Which structure follows FIFO?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Practice" }));
    const resumedQuestion = await screen.findByText("Which structure follows FIFO?");
    const resumedCard = resumedQuestion.closest("article");
    expect(resumedCard).not.toBeNull();
    expect(within(resumedCard!).getByRole("button", { name: /Queue/ })).toHaveClass("selected");
    expect(screen.getAllByText(/1 answered/).length).toBeGreaterThan(0);
  });

  it("opens a practice paper when a student launches a subject from Question bank", async () => {
    const createdTest = {
      attemptId: 712,
      mode: "practice",
      deadline: null,
      questions: [{ id: 41, subject: "Maths", topic: "Algebra", text: "What is 2 + 2?", options: ["2", "3", "4", "5"] }],
      warnings: [],
    };
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(response(200, { user: { id: 7, email: "learner@example.com", role: "STUDENT" } }));
      }
      if (path.endsWith("/bank")) {
        return Promise.resolve(response(200, { total: 2, subjects: [{ subject: "Maths", count: 2, topics: [{ topic: "Algebra", count: 2 }] }] }));
      }
      if (path.endsWith("/tests") && init?.method === "POST") {
        return Promise.resolve(response(201, createdTest));
      }
      if (path.endsWith("/exams/assigned")) return Promise.resolve(response(200, { assignments: [] }));
      if (path.endsWith("/announcements")) return Promise.resolve(response(200, { announcements: [] }));
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Question bank" }));
    fireEvent.click(await screen.findByRole("button", { name: /Maths/ }));

    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).endsWith("/tests") &&
      init?.method === "POST" &&
      JSON.parse(String(init.body)).subject === "Maths"
    )).toBe(true);
  });





  it("counts down practice time from the API clock and automatically submits at expiry", async () => {
    let performanceTime = 2000;
    vi.spyOn(performance, "now").mockImplementation(() => performanceTime);
    const serverNow = new Date(Date.now()).toISOString();
    const deadline = new Date(new Date(serverNow).getTime() + 60_000).toISOString();
    const intervalSpy = vi.spyOn(window, "setInterval");
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) return Promise.resolve(response(200, {
        user: { id: 4, email: "student@example.com", role: "STUDENT" },
      }));
      if (path.endsWith("/bank")) return Promise.resolve(response(200, {
        total: 1,
        subjects: [{ subject: "Maths", count: 1, topics: [] }],
      }));
      if (path.endsWith("/announcements/active") || path.endsWith("/announcements")) {
        return Promise.resolve(response(200, { announcements: [] }));
      }
      if (path.endsWith("/tests") && init?.method === "POST") {
        return Promise.resolve(response(201, {
          attemptId: 901,
          mode: "mock",
          deadline,
          serverNow,
          warnings: [],
          questions: [{ id: 90, subject: "Maths", topic: null, text: "Timed question?", options: ["A", "B", "C", "D"] }],
        }));
      }
      if (path.endsWith("/tests/901/submit") && init?.method === "POST") {
        return Promise.resolve(response(200, { attemptId: 901, score: 0, total: 1, expired: true }));
      }
      if (path.endsWith("/tests/901/result")) {
        return Promise.resolve(response(200, {
          attemptId: 901,
          score: 0,
          total: 1,
          breakdown: [{ subject: "Maths", correct: 0, total: 1 }],
          questions: [{
            questionId: 90,
            text: "Timed question?",
            options: ["A", "B", "C", "D"],
            selectedIndex: null,
            correctIndex: 0,
            isCorrect: false,
            explanation: "Review the concept.",
          }],
        }));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Practice" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start mock test" }));
    expect(await screen.findByText("Timed question?")).toBeInTheDocument();
    expect(screen.getByText("01:00 remaining")).toBeInTheDocument();

    const countdownInterval = intervalSpy.mock.calls.find(([, delay]) => delay === 1000)?.[0];
    expect(typeof countdownInterval).toBe("function");
    performanceTime += 1000;
    await act(async () => {
      (countdownInterval as () => void)();
    });
    expect(screen.getByText("00:59 remaining")).toBeInTheDocument();

    performanceTime += 60_000;
    await act(async () => {
      (countdownInterval as () => void)();
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) =>
        String(input).endsWith("/tests/901/submit") && init?.method === "POST"
      )).toBe(true);
    });
    expect(await screen.findByRole("heading", { name: "Your result" })).toBeInTheDocument();
    expect(screen.getByText("Correct answer:")).toBeInTheDocument();
    expect(screen.getByText("Review the concept.")).toBeInTheDocument();
    expect(screen.getAllByText("Not answered").length).toBeGreaterThan(0);
  });


  it("renders dashboard progress and opens detailed analytics", async () => {
    const overview = {
      generatedAt: new Date().toISOString(),
      practice: {
        completedAttempts: 5, questions: 30, correct: 24, incorrect: 6, unanswered: 0,
        accuracy: 0.8, subjects: [], difficulty: [], trend: [
          { attemptId: 1, finishedAt: "2026-11-20T10:00:00.000Z", accuracy: 0.6, correct: 6, total: 10 },
          { attemptId: 2, finishedAt: "2026-11-21T10:00:00.000Z", accuracy: 0.8, correct: 8, total: 10 },
        ],
      },
      formalExams: {
        submissions: 3, graded: 2, reviewRequired: 1, score: 36, maximumScore: 40,
        scorePercentage: 0.9, correct: 18, incorrect: 2, unanswered: 0, subjects: [],
      },
    };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) return Promise.resolve(response(200, {
        user: { id: 4, email: "student@example.com", role: "STUDENT" },
      }));
      if (path.endsWith("/bank")) return Promise.resolve(response(200, { total: 0, subjects: [] }));
      if (path.endsWith("/exams/assigned")) return Promise.resolve(response(200, { assignments: [] }));
      if (path.endsWith("/announcements/active") || path.endsWith("/announcements")) {
        return Promise.resolve(response(200, { announcements: [] }));
      }
      if (path.endsWith("/analytics/overview")) return Promise.resolve(response(200, overview));
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Progress at a glance" })).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /View detailed progress/ }));
    expect(await screen.findByRole("heading", { name: "Your progress" })).toBeInTheDocument();
    expect(screen.getByText("Completed practice tests")).toBeInTheDocument();
    expect(screen.getByText("Practice accuracy")).toBeInTheDocument();
    expect(screen.getByText("Official submissions")).toBeInTheDocument();
    expect(screen.getAllByText("80%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("img", { name: "Practice accuracy across recent completed attempts" })).toBeInTheDocument();
  });

  it("retries dashboard analytics after an incomplete response", async () => {
    const overview = {
      generatedAt: new Date().toISOString(),
      practice: {
        completedAttempts: 2, questions: 10, correct: 8, incorrect: 2, unanswered: 0,
        accuracy: 0.8, subjects: [], difficulty: [], trend: [],
      },
      formalExams: {
        submissions: 1, graded: 1, reviewRequired: 0, score: 8, maximumScore: 10,
        scorePercentage: 0.8, correct: 8, incorrect: 2, unanswered: 0, subjects: [],
      },
    };
    let analyticsRequests = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) return Promise.resolve(response(200, {
        user: { id: 4, email: "student@example.com", role: "STUDENT" },
      }));
      if (path.endsWith("/bank")) return Promise.resolve(response(200, { total: 0, subjects: [] }));
      if (path.endsWith("/exams/assigned")) return Promise.resolve(response(200, { assignments: [] }));
      if (path.endsWith("/announcements/active") || path.endsWith("/announcements")) {
        return Promise.resolve(response(200, { announcements: [] }));
      }
      if (path.endsWith("/analytics/overview")) {
        analyticsRequests += 1;
        return Promise.resolve(response(200, analyticsRequests === 1 ? { ok: true } : overview));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The progress response was incomplete. Refresh to try again.");
    fireEvent.click(screen.getByRole("button", { name: "Retry progress" }));
    expect(await screen.findByText("2", { selector: "strong" })).toBeInTheDocument();
    expect(analyticsRequests).toBe(2);
  });


});