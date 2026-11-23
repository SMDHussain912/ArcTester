import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentAssignedExams from "./StudentAssignedExams";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));
const mockedRequest = vi.mocked(request);

describe("StudentAssignedExams", () => {
  beforeEach(() => { mockedRequest.mockReset(); });

  it("shows assigned papers and runs the student start-answer-submit flow", async () => {
    const assignment = {
      id: "assignment-1", status: "ASSIGNED", assignedAt: "2026-11-24T00:00:00.000Z",
      availableFrom: null, dueAt: null,
      exam: { id: "exam-1", title: "ECET Mock 01", description: "CSE practice" },
      version: 1, durationMinutes: 30, questionCount: 1, submission: null,
    };
    const examPackage = {
      assignmentId: "assignment-1", title: "ECET Mock 01", instructions: "Choose one.",
      durationMinutes: 30, serverTime: new Date().toISOString(),
      questions: [{ id: "question-1", position: 0, subject: "CSE", topic: "DS", text: "FIFO structure?", options: ["Stack", "Queue", "Tree", "Graph"], optionOrder: [0, 1, 2, 3], marks: 1, negativeMarks: 0.25 }],
    };
    mockedRequest.mockImplementation(async (path, init) => {
      if (path === "/exams/assigned") return { assignments: [assignment] } as never;
      if (path.endsWith("/package")) return { package: examPackage } as never;
      if (path.endsWith("/session/start")) return { session: { startedAt: new Date().toISOString(), deadline: new Date(Date.now() + 1800000).toISOString() } } as never;
      if (path.endsWith("/answers") && init?.method !== "PUT") return { revision: 0, answers: [] } as never;
      if (path.endsWith("/answers") && init?.method === "PUT") return { revision: 1 } as never;
      if (path.endsWith("/submission")) return { submission: { status: "RECEIVED", score: null, maximumScore: null } } as never;
      return { ok: true } as never;
    });

    render(<StudentAssignedExams />);
    expect(await screen.findByRole("heading", { name: "Assigned exams" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "ECET Mock 01" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start / Resume exam" }));
    expect(await screen.findByText("FIFO structure?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Queue/ }));
    await waitFor(() => expect(mockedRequest).toHaveBeenCalledWith(
      "/exams/assignments/assignment-1/answers",
      expect.objectContaining({ method: "PUT" }),
    ));
    fireEvent.click(screen.getByRole("button", { name: "Review & submit" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit exam" }));
    await waitFor(() => expect(mockedRequest).toHaveBeenCalledWith(
      "/exams/assignments/assignment-1/submission",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(await screen.findByText("Exam submitted successfully.")).toBeInTheDocument();
  });
});
