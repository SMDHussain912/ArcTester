import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentAnnouncementDialog from "./StudentAnnouncementDialog";

describe("StudentAnnouncementDialog", () => {
  const announcement = {
    id: "notice-1",
    title: "Exam schedule update",
    message: "The mock examination starts at 10 AM.",
    expiresAt: "2026-11-12T10:00:00.000Z",
  };

  it("renders the announcement content and expiry", () => {
    render(
      <StudentAnnouncementDialog
        announcement={announcement}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Exam schedule update" })).toBeInTheDocument();
    expect(screen.getByText("The mock examination starts at 10 AM.")).toBeInTheDocument();
    expect(screen.getByText(/^Expires /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeEnabled();
  });

  it("calls the acknowledgement handler with the announcement id", () => {
    const onAcknowledge = vi.fn();
    render(
      <StudentAnnouncementDialog
        announcement={announcement}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onAcknowledge).toHaveBeenCalledExactlyOnceWith("notice-1");
  });

  it("omits the expiry label when the announcement has no expiry", () => {
    render(
      <StudentAnnouncementDialog
        announcement={{ ...announcement, expiresAt: null }}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.queryByText(/^Expires /)).not.toBeInTheDocument();
  });
});
