import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AdminWorkspace from "./AdminWorkspace";

function response(body: unknown): Response { return { ok: true, status: 200, json: async () => body } as Response; }

afterEach(() => vi.unstubAllGlobals());

describe("administrator workspace navigation", () => {
  it("opens every admin workspace from its navigation item", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/admin/question-catalog") return Promise.resolve(response({ subjects: [] }));
      if (path === "/admin/questions") return Promise.resolve(response({ questions: [], total: 0, pages: 1 }));
      if (path === "/admin/exams") return Promise.resolve(response({ exams: [] }));
      if (path === "/admin/students") return Promise.resolve(response({ students: [] }));
      if (path === "/admin/exam-results") return Promise.resolve(response({ results: [] }));
      if (path === "/admin/announcements") return Promise.resolve(response({ announcements: [] }));
      if (path === "/admin/model-datasets") return Promise.resolve(response({ datasets: [] }));
      if (path === "/admin/model-training-jobs") return Promise.resolve(response({ jobs: [] }));
      if (path === "/admin/submissions/review-required") return Promise.resolve(response({ submissions: [] }));
      if (path === "/admin/exams/live-sessions") return Promise.resolve(response({ sessions: [], total: 0, serverTime: "2026-11-10T10:00:00.000Z" }));
      return Promise.resolve(response({}));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminWorkspace email="admin@example.test" theme="light" setTheme={vi.fn()} signOut={vi.fn()} invitations={[]} createInvitation={vi.fn()} inviteEmail="" setInviteEmail={vi.fn()} createdInvitation={null} revokeInvitation={vi.fn()} busy={false} />);

    const workspaces = [
      ["Overview", "Build better exams."],
      ["Question bank", "Question bank"],
      ["Add question", "Add a question"],
      ["Import questions", "Upload question sets"],
      ["Mock test builder", "Mock test builder"],
      ["Exam management", "Exam management"],
      ["Results & analytics", "Results & analytics"],
      ["Announcements", "Announcements"],
      ["Subjects & topics", "Subjects & topics"],
      ["Student access", "Invitations"],
      ["Review queue", "Review queue"],
      ["Live invigilation", "Live invigilation"],
      ["Model lab", "Model lab"],
    ] as const;

    for (const [navigationLabel, heading] of workspaces) {
      fireEvent.click(screen.getByRole("button", { name: navigationLabel }));
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(fetchMock).toHaveBeenCalled();
  });
});
