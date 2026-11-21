import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentWebLearningPath from "./StudentWebLearningPath";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));
const mockedRequest = vi.mocked(request);

describe("StudentWebLearningPath", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockImplementation(async (path) => {
      if (path === "/bank") return { total: 12, subjects: [{ subject: "Data Structures", count: 12, practiceCount: 12, topics: [{ topic: "Arrays", count: 5 }, { topic: "Trees", count: 7 }] }] };
      if (path === "/analytics/weak-topics") return { subjects: [], topics: [{ subject: "Data Structures", topic: "Arrays", seen: 2, correct: 1, wrong: 1, accuracy: 0.5 }] };
      return { practice: { subjects: [{ subject: "Data Structures", topic: null, seen: 2, correct: 1, wrong: 1, accuracy: 0.5 }] } };
    });
  });

  it("shows authoritative path progress and expands topic progress", async () => {
    render(<StudentWebLearningPath onPractice={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Your learning path" })).toBeTruthy();
    expect(await screen.findByText("/ 12 questions explored", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Explore topics" }));
    expect(await screen.findByText("Arrays")).toBeTruthy();
    expect(screen.getByText("2 / 5 explored")).toBeTruthy();
    expect(screen.getByText("0 / 7 explored")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Overall learning path progress" })).toHaveAttribute("aria-valuenow", "17");
  });

  it("starts subject and topic practice with the selected preset", async () => {
    const onPractice = vi.fn();
    render(<StudentWebLearningPath onPractice={onPractice} />);
    await screen.findAllByRole("heading", { name: "Data Structures" });
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));
    expect(onPractice).toHaveBeenCalledWith("Data Structures");
    fireEvent.click(screen.getByRole("button", { name: "Explore topics" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Practice topic" })[0]);
    expect(onPractice).toHaveBeenLastCalledWith("Data Structures", "Arrays");
  });
});
