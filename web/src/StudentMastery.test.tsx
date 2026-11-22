import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StudentMastery from "./StudentMastery";
import { request } from "./apiClient";
vi.mock("./apiClient", () => ({ request: vi.fn() }));
describe("StudentMastery", () => {
 beforeEach(() => {
  vi.mocked(request).mockReset();
  vi.mocked(request).mockImplementation(async (path: string) => {
   if (path === "/learning/mastery") return {} as never;
   if (path === "/gamification/quests") return {} as never;
   if (path === "/gamification/badges") return {} as never;
   if (path === "/learning/practice-mistakes?limit=10") return { questions: [{ id: 3, text: "Review this question", subject: "CSE", topic: "Arrays", questionType: "matching", options: undefined, promptData: undefined }] } as never;
   throw new Error("Unexpected endpoint: " + path);
  });
 });
 it("renders empty mastery and normalizes malformed review question data", async () => {
  render(<StudentMastery />);
  expect(await screen.findByText("Review this question")).toBeInTheDocument();
  expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  expect(screen.getByText("Review 1 of 1")).toBeInTheDocument();
 });
});
