import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminLessonStudio from "./AdminLessonStudio";

const script = {
  title: "Stack basics",
  learningObjectives: ["Explain LIFO", "Trace push and pop"],
  sections: [
    { heading: "Meaning", explanation: "A stack stores values using last in first out order.", example: "A stack of plates.", teacherCue: "" },
    { heading: "Operations", explanation: "Push adds an item and pop removes the most recent item.", example: "Push A then B; pop returns B.", teacherCue: "" },
  ],
  keyTakeaways: ["Stack follows LIFO", "Push and pop work at the top"],
  groundingNotes: [],
};
const storyboard = { scenes: [
  { sceneType: "title_card", title: "Stack", narration: "Introduce the stack data structure.", onScreenText: "Stack", durationMs: 3000, visual: {} },
  { sceneType: "step_sequence", title: "Push", narration: "Show how values are added to the top.", onScreenText: "Push", durationMs: 5000, visual: { steps: ["Push A", "Push B"] } },
  { sceneType: "checkpoint", title: "Recall", narration: "Recall which item is removed first.", onScreenText: "Which pops first?", durationMs: 4000, visual: {} },
] };
const draft = {
  id: "draft-1", title: script.title, subject: "Computer Science", topic: "Stacks",
  status: "DRAFT", provider: "nvidia", model: "test-model",
  createdAt: "2026-11-22T00:00:00.000Z", updatedAt: "2026-11-22T00:00:00.000Z",
  sourceTitle: "Stack notes", sourceText: "Stack source material ".repeat(8),
  scriptJson: JSON.stringify(script), storyboardJson: JSON.stringify(storyboard),
};
function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
afterEach(() => vi.unstubAllGlobals());

describe("AdminLessonStudio", () => {
  it("generates a draft from source text, opens it, previews scenes and saves edits", async () => {
    let generated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin/lesson-drafts" && (!init?.method || init.method === "GET")) {
        return response({ drafts: generated ? [draft] : [] });
      }
      if (url.pathname === "/admin/lesson-drafts/generate" && init?.method === "POST") {
        generated = true;
        return response({ draft }, 201);
      }
      if (url.pathname === "/admin/lesson-drafts/draft-1" && (!init?.method || init.method === "GET")) {
        return response({ draft });
      }
      if (url.pathname === "/admin/lesson-drafts/draft-1" && init?.method === "PATCH") {
        return response({ ok: true, draft });
      }
      return response({ error: "Unexpected test request" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminLessonStudio />);

    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Stacks" } });
    fireEvent.change(screen.getByLabelText("Source title"), { target: { value: "Stack notes" } });
    fireEvent.change(screen.getByLabelText("Source material"), { target: { value: "Stack is a linear data structure that follows last in first out order. Push adds to the top and pop removes from the top. ".repeat(2) } });
    fireEvent.click(screen.getByRole("button", { name: "Generate lesson draft" }));

    expect(await screen.findByRole("heading", { name: "Review lesson draft" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "3 scenes" })).toBeInTheDocument();
    expect(screen.getByText("Which pops first?")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Lesson title"), { target: { value: "Stack operations" } });\n    fireEvent.change(screen.getByLabelText("Scene 2 title"), { target: { value: "Push operation visual" } });\n    expect(screen.getByLabelText("Scene 2 title")).toHaveValue("Push operation visual");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/lesson-drafts/draft-1"),
      expect.objectContaining({ method: "PATCH", credentials: "include" }),
    ));
    const patchCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === "PATCH");
    const saved = JSON.parse(String((patchCall?.[1] as RequestInit | undefined)?.body));\n    expect(saved).toMatchObject({ title: "Stack operations" });\n    expect(saved.storyboard.scenes[1].title).toBe("Push operation visual");
  });
});
