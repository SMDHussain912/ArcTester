import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentNavigation from "./StudentNavigation";

describe("StudentNavigation", () => {
  it("renders active navigation and pending item counts", () => {
    render(
      <StudentNavigation
        activePage="dashboard"
        setActivePage={vi.fn()}
        examActive={false}
        pendingExamCount={3}
        unreadAnnouncementCount={2}
        unreadNotificationCount={4}
        theme="light"
        onToggleTheme={vi.fn()}
        email="student@example.com"
        busy={false}
        onSignOut={vi.fn()}
      />,
    );

    const navigation = screen.getByRole("navigation", { name: "Student navigation" });
    expect(within(navigation).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("button", { name: "Assigned exams (3)" })).toBeEnabled();
    expect(within(navigation).getByRole("button", { name: "Announcements (2)" })).toBeEnabled();
    expect(within(navigation).getByRole("button", { name: "Notifications (4)" })).toBeEnabled();
    expect(screen.getByText("student@example.com")).toBeInTheDocument();
  });

  it("locks navigation during an active exam and keeps account actions available", () => {
    const setActivePage = vi.fn();
    const onToggleTheme = vi.fn();
    const onSignOut = vi.fn();

    render(
      <StudentNavigation
        activePage="practice"
        setActivePage={setActivePage}
        examActive
        pendingExamCount={0}
        unreadAnnouncementCount={0}
        unreadNotificationCount={0}
        theme="dark"
        onToggleTheme={onToggleTheme}
        email="student@example.com"
        busy={false}
        onSignOut={onSignOut}
      />,
    );

    const navigation = screen.getByRole("navigation", { name: "Student navigation" });
    const dashboard = within(navigation).getByRole("button", { name: "Dashboard" });
    expect(dashboard).toBeDisabled();
    expect(dashboard).toHaveAttribute("title", "Navigation is locked while an assigned exam is active");
    expect(within(navigation).getByRole("button", { name: "Practice" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(setActivePage).not.toHaveBeenCalled();
    expect(onToggleTheme).toHaveBeenCalledOnce();
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("disables sign out while an account action is busy", () => {
    render(
      <StudentNavigation
        activePage="dashboard"
        setActivePage={vi.fn()}
        examActive={false}
        pendingExamCount={0}
        unreadAnnouncementCount={0}
        theme="light"
        onToggleTheme={vi.fn()}
        email="student@example.com"
        busy
        onSignOut={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
  });
});
