import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentNotificationsInbox from "./StudentNotificationsInbox";

describe("StudentNotificationsInbox", () => {
  it("renders read and unread notices and forwards open/read actions", () => {
    const onRead = vi.fn();
    const onOpen = vi.fn();
    render(<StudentNotificationsInbox
      items={[
        { id: "notice-1", kind: "EXAM_ASSIGNMENT", title: "New exam assigned", message: "Open your exams.", href: "/assignments", createdAt: "2026-11-10T08:00:00.000Z", readAt: null, expiresAt: null },
        { id: "notice-2", kind: "EXAM_RESULT", title: "Result available", message: "Your result is ready.", href: "/assignments/a1/result", createdAt: "2026-11-10T07:00:00.000Z", readAt: "2026-11-10T08:00:00.000Z", expiresAt: null },
      ]}
      onRefresh={vi.fn()}
      onRead={onRead}
      onOpen={onOpen}
    />);
    expect(screen.getByRole("heading", { name: "Notification inbox" })).toBeInTheDocument();
    expect(screen.getByText("UNREAD")).toBeInTheDocument();
    expect(screen.getByText("READ")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    expect(onOpen).toHaveBeenCalledWith("notice-1");
    expect(onRead).toHaveBeenCalledWith("notice-1");
  });
});
