import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentNotificationBanner from "./StudentNotificationBanner";

describe("StudentNotificationBanner", () => {
  it("shows the assignment/result notice with its destination", () => {
    render(
      <StudentNotificationBanner
        notification={{
          id: "notice-1",
          title: "Exam result available",
          message: "Your mock exam has been graded.",
          href: "/assignments/assignment-1/result",
        }}
        onRead={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("status", { name: "New notification" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exam result available" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });

  it("asks the parent to persist the read state", () => {
    const onRead = vi.fn();
    const onOpen = vi.fn();
    render(
      <StudentNotificationBanner
        notification={{ id: "notice-1", title: "New exam assigned", message: "Open your exams.", href: "/assignments" }}
        onRead={onRead}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "notice-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    expect(onRead).toHaveBeenCalledOnce();
    expect(onRead).toHaveBeenCalledWith("notice-1");
  });
});
