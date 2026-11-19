import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentDashboardWelcome from "./StudentDashboardWelcome";

describe("StudentDashboardWelcome", () => {
  it("renders the dashboard hero and all six real student workspaces", () => {
    render(<StudentDashboardWelcome visible onNavigate={vi.fn()} pendingExamCount={2} unreadAnnouncementCount={3} unreadNotificationCount={4} questionCount={120} subjectCount={6} />);
    expect(screen.getByRole("heading", { name: "Make every practice count." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What would you like to do?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start practice: Create a test" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assigned exams: 2 pending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Question bank: 120 questions · 6 subjects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your progress: View analytics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Announcements: 3 unread" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications: 4 unread" })).toBeInTheDocument();
  });

  it("routes every workspace card to its real student page", () => {
    const onNavigate = vi.fn();
    render(<StudentDashboardWelcome visible onNavigate={onNavigate} />);
    ["Start practice", "Assigned exams", "Question bank", "Your progress", "Announcements", "Notifications"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
    });
    expect(onNavigate.mock.calls).toEqual([["practice"], ["assigned-exams"], ["question-bank"], ["progress"], ["announcements"], ["notifications"]]);
  });

  it("keeps the entire dashboard hidden when another page is active", () => {
    const { container } = render(<StudentDashboardWelcome visible={false} onNavigate={vi.fn()} />);
    expect(container.querySelector(".student-dashboard-home")).toHaveAttribute("hidden");
  });
});
