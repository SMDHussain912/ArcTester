import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentWebLessonPlayer from "./StudentWebLessonPlayer";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn(), API: "/api" }));
const mockedRequest = vi.mocked(request);

const lesson = {
  id: "lesson-1", title: "Arrays made simple", subject: "Data Structures", topic: "Arrays",
  script: {
    title: "Arrays", learningObjectives: ["Understand array indexing", "Trace an array example"],
    sections: [{ heading: "Indexing", explanation: "An array stores values at indexed positions.", example: "A[0] is the first item.", teacherCue: "Remember zero-based indexing." }],
    keyTakeaways: ["Index starts at zero"], groundingNotes: [],
  },
  storyboard: { scenes: [
    { sceneType: "title_card", title: "Welcome", narration: "Today we learn arrays.", onScreenText: "Arrays", durationMs: 5000, visual: { label: "", items: [], connections: [], equation: "", steps: [] } },
    { sceneType: "diagram", title: "Array slots", narration: "Each item has an index.", onScreenText: "", durationMs: 7000, visual: { label: "Slots", items: ["A[0]", "A[1]"], connections: [{ from: "A[0]", to: "A[1]", label: "next" }], equation: "", steps: [] } },
    { sceneType: "checkpoint", title: "Recall", narration: "What index is first?", onScreenText: "", durationMs: 5000, visual: { label: "", items: [], connections: [], equation: "", steps: [] } },
  ] },
};

describe("StudentWebLessonPlayer", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue({ ok: true, lessons: [lesson] } as never);
  });

  it("loads published lessons and navigates through scene content and notes", async () => {
    render(<StudentWebLessonPlayer />);
    expect(await screen.findByRole("heading", { name: "Lesson library" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Arrays made simple" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start lesson" }));
    expect(await screen.findByRole("heading", { name: "Welcome" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next scene/ }));
    expect(await screen.findByRole("heading", { name: "Array slots" })).toBeTruthy();
    expect(screen.getByText("A[0]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Read lesson notes" }));
    expect(screen.getByRole("heading", { name: "Indexing" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next scene/ }));
    expect(await screen.findByRole("heading", { name: "Recall" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish lesson" }));
    expect(await screen.findByRole("heading", { name: "Lesson library" })).toBeTruthy();
  });

  it("shows an empty state when no published lessons exist", async () => {
    mockedRequest.mockResolvedValue({ ok: true, lessons: [] } as never);
    render(<StudentWebLessonPlayer />);
    expect(await screen.findByText(/No published lessons are available yet/)).toBeTruthy();
  });
});
