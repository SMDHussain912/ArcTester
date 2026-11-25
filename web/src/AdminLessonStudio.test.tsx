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
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("AdminLessonStudio", () => {
  it("imports a prepared lesson package as a draft without generating AI content", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin/lesson-drafts" && (!init?.method || init.method === "GET")) {
        return response({ drafts: [draft] });
      }
      if (url.pathname === "/admin/lesson-drafts/import" && init?.method === "POST") {
        return response({ ok: true, draft }, 201);
      }
      if (url.pathname === "/admin/lesson-drafts/draft-1" && (!init?.method || init.method === "GET")) {
        return response({ draft });
      }
      return response({ error: "Unexpected test request" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminLessonStudio />);
    const packageText = JSON.stringify({
      title: script.title, subject: "Computer Science", topic: "Stacks", script, storyboard,
    });
    const packageFile = new File([packageText], "stacks.lesson.json", { type: "application/json" });
    Object.defineProperty(packageFile, "text", { value: async () => packageText });

    fireEvent.change(screen.getByLabelText("Import finished lesson package"), { target: { files: [packageFile] } });

    expect(await screen.findByRole("heading", { name: "Review lesson draft" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/lesson-drafts/import"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    ));
    const importCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/admin/lesson-drafts/import"));
    const imported = JSON.parse(String((importCall?.[1] as RequestInit | undefined)?.body));
    expect(imported).toMatchObject({ fileName: "stacks.lesson.json", title: script.title, subject: "Computer Science", topic: "Stacks" });
    expect(screen.getByText(/Imported stacks.lesson.json as an unpublished draft/)).toBeInTheDocument();
  });

  it("opens an existing draft, reviews and publishes it without remote generation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin/lesson-drafts" && (!init?.method || init.method === "GET")) {
        return response({ drafts: [draft] });
      }
      if (url.pathname === "/admin/lesson-drafts/draft-1" && (!init?.method || init.method === "GET")) {
        return response({ draft });
      }
      if (url.pathname === "/admin/lesson-drafts/draft-1" && init?.method === "PATCH") {
        return response({ ok: true, draft });
      }
      if (url.pathname === "/admin/lesson-drafts/draft-1/package/publish" && init?.method === "POST") {
        return response({ ok: true, version: { version: 1, versionId: "version-1", sceneCount: 3, uploadedObjectCount: 4, reusedObjectCount: 0 } }, 201);
      }
      return response({ error: "Unexpected test request" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminLessonStudio />);

    expect(await screen.findByRole("heading", { name: "Lesson Studio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate lesson draft" })).not.toBeInTheDocument();
    expect(await screen.findByText("Stack basics")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open draft" }));
    expect(await screen.findByRole("heading", { name: "Review lesson draft" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "3 scenes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Scene 3 on-screen text")).toHaveValue("Which pops first?");

    fireEvent.change(screen.getByLabelText("Lesson title"), { target: { value: "Stack operations" } });
    fireEvent.change(screen.getByLabelText("Lesson audience scope"), { target: { value: "BRANCH" } });
    fireEvent.change(screen.getByLabelText("Diploma branch"), { target: { value: "Diploma in Computer Engineering" } });
    fireEvent.change(screen.getByLabelText("Scene 2 title"), { target: { value: "Push operation visual" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/lesson-drafts/draft-1"),
      expect.objectContaining({ method: "PATCH", credentials: "include" }),
    ));
    const patchCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === "PATCH");
    const saved = JSON.parse(String((patchCall?.[1] as RequestInit | undefined)?.body));
    expect(saved).toMatchObject({ title: "Stack operations", audienceScope: "BRANCH", targetBranchName: "Diploma in Computer Engineering" });
    expect(saved.storyboard.scenes[1].title).toBe("Push operation visual");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Publish lesson" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/lesson-drafts/draft-1/package/publish"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    ));
    expect(await screen.findByText("Published · Student visible")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/admin/lesson-drafts/generate"))).toBe(false);
  });
});
