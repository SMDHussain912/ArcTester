import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminSubjects, { type AdminCatalogSubject } from "./AdminSubjects";

const catalog: AdminCatalogSubject[] = [{
  id: 1, name: "Mathematics", count: 42, topics: [
    { id: 11, name: "Algebra", _count: { questions: 18 } },
    { id: 12, name: "Calculus", _count: { questions: 24 } },
  ],
}];

describe("AdminSubjects", () => {
  it("renders subject question counts and topic coverage", () => {
    render(<AdminSubjects catalog={catalog} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Subjects & topics" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mathematics" })).toBeTruthy();
    expect(screen.getByText("42 questions")).toBeTruthy();
    expect(screen.getByText("2 topics")).toBeTruthy();
    expect(screen.getByText("Algebra")).toBeTruthy();
    expect(screen.getByText("18 questions")).toBeTruthy();
    expect(screen.getByText("Calculus")).toBeTruthy();
  });

  it("renders an empty catalog and delegates refresh", () => {
    const onRefresh = vi.fn();
    render(<AdminSubjects catalog={[]} onRefresh={onRefresh} />);
    expect(screen.getByRole("heading", { name: "Subjects & topics" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh catalog" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
