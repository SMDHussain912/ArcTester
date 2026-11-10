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
    expect(screen.getAllByRole("heading", { name: "Mathematics" })).toHaveLength(2);
    expect(screen.getByText("42 questions")).toBeTruthy();
    expect(screen.getByText("2 topics")).toBeTruthy();
    expect(screen.getByText("Algebra")).toBeTruthy();
    expect(screen.getByText("18 questions")).toBeTruthy();
    expect(screen.getByText("Calculus")).toBeTruthy();
  });

  it("compares bank counts with every AP ECET 2026 blueprint target and combines legacy aliases", () => {
    const onRefresh = vi.fn();
    const subjects: AdminCatalogSubject[] = [
      ...catalog,
      { id: 2, name: "Maths", count: 8, topics: [] },
      { id: 3, name: "Computer Organisation", count: 4, topics: [] },
      { id: 4, name: "Java", count: 12, topics: [] },
    ];
    render(<AdminSubjects catalog={subjects} onRefresh={onRefresh} />);

    expect(screen.getByText("66 / 200 blueprint questions currently in the bank")).toBeInTheDocument();
    expect(screen.getByText("50 / 50 questions")).toBeInTheDocument();
    expect(screen.getAllByText("6 needed").length).toBeGreaterThan(0);
    expect(screen.getByText("4 / 8 questions")).toBeInTheDocument();
    expect(screen.getByText("4 needed")).toBeInTheDocument();
    expect(screen.getByText("12 / 10 questions")).toBeInTheDocument();
    expect(screen.getByText("2 above target")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Official CSE syllabus" })).toHaveAttribute(
      "href",
      "https://cets.apsche.ap.gov.in/ECET/PDF/Diploma%20Holders%20in%20Engineering/APECET2026_COMPUTER_SCIENCE_AND_ENGINEERING.pdf",
    );
    expect(screen.getByRole("progressbar", { name: "Mathematics blueprint coverage" })).toHaveAttribute("value", "100");
  });

  it("shows zero coverage for blueprint subjects that have no bank questions", () => {
    render(<AdminSubjects catalog={[]} onRefresh={vi.fn()} />);
    expect(screen.getByText("0 / 200 blueprint questions currently in the bank")).toBeInTheDocument();
    expect(screen.getAllByText("0 / 6 questions").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6 needed").length).toBeGreaterThan(0);
  });

  it("renders an empty catalog and delegates refresh", () => {
    const onRefresh = vi.fn();
    render(<AdminSubjects catalog={[]} onRefresh={onRefresh} />);
    expect(screen.getByRole("heading", { name: "Subjects & topics" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh catalog" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
