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
    const updates = screen.getByRole("navigation", { name: "Student updates" });
    expect(within(navigation).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("button", { name: "Assigned exams (3)" })).toBeEnabled();
    expect(within(updates).getByRole("button", { name: "Announcements (2)" })).toBeEnabled();
    expect(within(updates).getByRole("button", { name: "Notifications (4)" })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "ArcTester dashboard" })).toBeDisabled();
    expect(within(navigation).getByRole("button", { name: "Practice" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(setActivePage).not.toHaveBeenCalled();
    expect(onToggleTheme).toHaveBeenCalledOnce();
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("returns to the dashboard when the brand is clicked outside an active exam", () => {
    const setActivePage = vi.fn();
    render(
      <StudentNavigation
        activePage="practice"
        setActivePage={setActivePage}
        examActive={false}
        pendingExamCount={0}
        unreadAnnouncementCount={0}
        unreadNotificationCount={0}
        theme="light"
        onToggleTheme={vi.fn()}
        email="student@example.com"
        busy={false}
        onSignOut={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ArcTester dashboard" }));
    expect(setActivePage).toHaveBeenCalledWith("dashboard");
  });

  it("disables sign out while an account action is busy", () => {
    render(
      <StudentNavigation
        activePage="dashboard"
        setActivePage={vi.fn()}
        examActive={false}
        pendingExamCount={0}
        unreadAnnouncementCount={0}
        unreadNotificationCount={0}
        theme="light"
        onToggleTheme={vi.fn()}
        email="student@example.com"
        busy
        onSignOut={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
  });

  it("groups learning and update links and exposes the active workspace in the top bar", () => {
    render(
      <StudentNavigation
        activePage="progress"
        setActivePage={vi.fn()}
        examActive={false}
        pendingExamCount={1}
        unreadAnnouncementCount={2}
        unreadNotificationCount={3}
        theme="light"
        onToggleTheme={vi.fn()}
        email="learner@example.test"
        busy={false}
        onSignOut={vi.fn()}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Student workspace" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Student navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Student updates" })).toBeInTheDocument();
    expect(screen.getByText("Progress", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("STUDENT WORKSPACE")).toBeInTheDocument();
  });

  it("shows update counts independently from the active navigation state", () => {
    render(
      <StudentNavigation
        activePage="dashboard"
        setActivePage={vi.fn()}
        examActive={false}
        pendingExamCount={5}
        unreadAnnouncementCount={2}
        unreadNotificationCount={4}
        theme="light"
        onToggleTheme={vi.fn()}
        email="learner@example.test"
        busy={false}
        onSignOut={vi.fn()}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Student navigation" })).toHaveTextContent("Assigned exams5");
    expect(screen.getByRole("navigation", { name: "Student updates" })).toHaveTextContent("Announcements2");
    expect(screen.getByRole("navigation", { name: "Student updates" })).toHaveTextContent("Notifications4");
  });
});
