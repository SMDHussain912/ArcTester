import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminWorkspace from "./AdminWorkspace";

function response(body: unknown): Response { return { ok: true, status: 200, json: async () => body } as Response; }
function renderAdmin(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  return render(<AdminWorkspace email="admin@example.test" theme="light" setTheme={vi.fn()} signOut={vi.fn()} invitations={[]} createInvitation={vi.fn()} inviteEmail="" setInviteEmail={vi.fn()} createdInvitation={null} revokeInvitation={vi.fn()} busy={false} />);
}
afterEach(() => vi.unstubAllGlobals());

describe("AP ECET 2026 exam preset", () => {
  it("loads the official 200-question quotas and no-negative-marking scheme", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin/question-catalog") return Promise.resolve(response({ subjects: [{ id: 1, name: "Maths", count: 50, topics: [] }] }));
      if (url.pathname === "/admin/questions") return Promise.resolve(response({ questions: [], total: 0, pages: 1 }));
      if (url.pathname === "/admin/exams") return Promise.resolve(response({ exams: [] }));
      if (url.pathname === "/admin/students") return Promise.resolve(response({ students: [] }));
      if (url.pathname === "/admin/announcements") return Promise.resolve(response({ announcements: [] }));
      return Promise.resolve(response({}));
    });
    renderAdmin(fetchMock);
    fireEvent.click(await screen.findByRole("button", { name: "Mock test builder" }));
    fireEvent.click(screen.getByRole("button", { name: "Load AP ECET CSE preset" }));
    expect((screen.getByLabelText("Duration (minutes)") as HTMLInputElement).value).toBe("180");
    expect((screen.getByLabelText("Marks per question") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Negative marks") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText(/Maths.*50 available/) as HTMLInputElement).value).toBe("50");
  });

  it("blocks paper creation and reports subject-level shortages", async () => {
    const onlyQuestion = { id: 1, subject: "Maths", difficulty: "easy", text: "One available question", topic: "Algebra", options: ["A", "B", "C", "D"], correctIndex: 0, explanation: "", source: "", };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin/question-catalog") return Promise.resolve(response({ subjects: [{ id: 1, name: "Maths", count: 1, topics: [] }] }));
      if (url.pathname === "/admin/questions" && url.searchParams.has("limit")) return Promise.resolve(response({ questions: [onlyQuestion], pages: 1, total: 1 }));
      if (url.pathname === "/admin/questions") return Promise.resolve(response({ questions: [onlyQuestion], pages: 1, total: 1 }));
      if (url.pathname === "/admin/exams" && init?.method === "POST") return Promise.resolve(response({ id: "unexpected" }));
      if (url.pathname === "/admin/exams") return Promise.resolve(response({ exams: [] }));
      if (url.pathname === "/admin/students") return Promise.resolve(response({ students: [] }));
      if (url.pathname === "/admin/announcements") return Promise.resolve(response({ announcements: [] }));
      return Promise.resolve(response({}));
    });
    renderAdmin(fetchMock);
    fireEvent.click(await screen.findByRole("button", { name: "Mock test builder" }));
    fireEvent.click(screen.getByRole("button", { name: "Load AP ECET CSE preset" }));
    fireEvent.change(screen.getByLabelText("Test title"), { target: { value: "AP ECET CSE full mock" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft exam →" }));
    expect(await screen.findByText(/Question bank shortfall/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input, init]) => new URL(String(input)).pathname === "/admin/exams" && init?.method === "POST")).toBe(false);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).pathname === "/admin/questions" && String(input).includes("limit=100"))).toBe(true));
  });
});
