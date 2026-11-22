import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StudentLearning from "./StudentLearning";
import { request } from "./apiClient";
vi.mock("./apiClient", () => ({ request: vi.fn() }));
describe("StudentLearning", () => {
 beforeEach(() => vi.mocked(request).mockReset());
 it("normalizes concept entries with missing arrays", async () => {
  vi.mocked(request).mockResolvedValue({ concepts: [{}] } as never);
  render(<StudentLearning setActivePage={vi.fn()} />);
  expect(await screen.findByRole("heading", { name: "Untitled concept" })).toBeInTheDocument();
  expect(screen.getByText("General · General")).toBeInTheDocument();
 });
});
