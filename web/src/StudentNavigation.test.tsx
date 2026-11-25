import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentNavigation from "./StudentNavigation";

const props = {
  activePage: "dashboard" as const,
  setActivePage: vi.fn(),
  unreadAnnouncementCount: 2,
  unreadNotificationCount: 3,
  theme: "light" as const,
  onToggleTheme: vi.fn(),
  email: "student@example.com",
  busy: false,
  onSignOut: vi.fn(),
};

describe("StudentNavigation", () => {
  it("groups desktop destinations and keeps exam pages reachable", () => {
    const setActivePage = vi.fn();
    render(<StudentNavigation {...props} setActivePage={setActivePage} />);
    const nav = screen.getByRole("navigation", { name: "Student navigation" });
    expect(within(nav).getByText("Home")).toBeInTheDocument();
    const exams = within(nav).getByText("Exams & results").closest("details")!;
    fireEvent.click(within(exams).getByText("Exams & results"));
    expect(within(exams).getByRole("button", { name: "Practice exams" })).toBeEnabled();
    expect(within(exams).getByRole("button", { name: "Question bank" })).toBeEnabled();
    expect(within(exams).getByRole("button", { name: "Assigned / real exams" })).toBeEnabled();
    expect(within(exams).getByRole("button", { name: "Performance analytics" })).toBeEnabled();
    fireEvent.click(within(exams).getByRole("button", { name: "Performance analytics" }));
    expect(setActivePage).toHaveBeenCalledWith("analytics");
    fireEvent.click(within(exams).getByRole("button", { name: "Assigned / real exams" }));
    expect(setActivePage).toHaveBeenCalledWith("assignments");
  });

  it("shows a compact mobile bottom navigation and routes remaining pages through More", () => {
    const setActivePage = vi.fn();
    render(<StudentNavigation {...props} setActivePage={setActivePage} />);
    const mobile = screen.getByRole("navigation", { name: "Mobile student navigation" });
    expect(within(mobile).getByRole("button", { name: "Dashboard" })).toBeEnabled();
    expect(within(mobile).getByRole("button", { name: "Practice exams" })).toBeEnabled();
    expect(within(mobile).getByRole("button", { name: "Performance analytics" })).toBeEnabled();
    expect(within(mobile).getByRole("button", { name: "Assigned / real exams" })).toBeEnabled();
    const more = within(mobile).getByRole("button", { name: /More/ });
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const menu = within(mobile).getByRole("menu", { name: "More student pages" });
    fireEvent.click(within(menu).getByRole("button", { name: "Learning progress" }));
    expect(setActivePage).toHaveBeenCalledWith("progress");
    expect(more).toHaveAttribute("aria-expanded", "false");
  });
});
