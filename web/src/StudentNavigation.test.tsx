import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentNavigation from "./StudentNavigation";

const props = {
  activePage: "dashboard" as const,
  setActivePage: vi.fn(),
  unreadNotificationCount: 3,
  theme: "light" as const,
  onToggleTheme: vi.fn(),
  onOpenNotifications: vi.fn(),
  email: "student@example.com",
  busy: false,
  onSignOut: vi.fn(),
};

describe("StudentNavigation", () => {
  it("groups desktop destinations and keeps exam pages reachable", () => {
    const setActivePage = vi.fn();
    render(<StudentNavigation {...props} setActivePage={setActivePage} />);
    const nav = screen.getByRole("navigation", { name: "Student navigation" });
    const dashboard = within(nav).getByRole("button", { name: "Dashboard" });
    expect(dashboard).toBeInTheDocument();
    expect(dashboard.closest("details")).toBeNull();
    expect(within(nav).queryByText("Home")).not.toBeInTheDocument();
    expect(within(nav).getByText("Learning")).toBeInTheDocument();
    const learning = within(nav).getByText("Learning").closest("details")!;
    fireEvent.click(within(learning).getByText("Learning"));
    expect(within(learning).getByRole("button", { name: "Concept library" })).toBeEnabled();
    fireEvent.click(within(learning).getByRole("button", { name: "Concept library" }));
    expect(setActivePage).toHaveBeenCalledWith("concepts");
    const exams = within(nav).getByText("Exams & results").closest("details")!;
    expect(within(exams).getByRole("button", { name: "Practice exams" })).toBeEnabled();
    expect(within(exams).getByRole("button", { name: "Question bank" })).toBeEnabled();
    expect(within(exams).getByRole("button", { name: "Assigned / real exams" })).toBeEnabled();
    expect(within(exams).getByRole("button", { name: "Performance analytics" })).toBeEnabled();
    fireEvent.click(within(exams).getByRole("button", { name: "Performance analytics" }));
    expect(setActivePage).toHaveBeenCalledWith("analytics");
    fireEvent.click(within(exams).getByRole("button", { name: "Assigned / real exams" }));
    expect(setActivePage).toHaveBeenCalledWith("assignments");
  });

  it("keeps unfinished learning pages out of More and puts account access there", () => {
    const setActivePage = vi.fn();
    const onOpenNotifications = vi.fn();
    render(<StudentNavigation {...props} setActivePage={setActivePage} onOpenNotifications={onOpenNotifications} />);
    const mobile = screen.getByRole("navigation", { name: "Mobile student navigation" });
    expect(within(mobile).getByRole("button", { name: "Dashboard" })).toBeEnabled();
    expect(within(mobile).getByRole("button", { name: "Practice exams" })).toBeEnabled();
    expect(within(mobile).getByRole("button", { name: "Performance analytics" })).toBeEnabled();
    expect(within(mobile).getByRole("button", { name: "Assigned / real exams" })).toBeEnabled();
    const more = within(mobile).getByRole("button", { name: /More/ });
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const menu = within(mobile).getByRole("menu", { name: "More student pages" });
    expect(within(menu).queryByRole("button", { name: "Learning path" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: "Learning progress" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Concept library" })).toBeEnabled();
    fireEvent.click(within(menu).getByRole("button", { name: "Account" }));
    expect(setActivePage).toHaveBeenCalledWith("account");
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Open notifications, 3 unread" }));
    expect(onOpenNotifications).toHaveBeenCalled();
  });
});
