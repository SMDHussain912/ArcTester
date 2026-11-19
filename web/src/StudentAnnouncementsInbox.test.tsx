import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentAnnouncementsInbox from "./StudentAnnouncementsInbox";

describe("StudentAnnouncementsInbox", () => {
  it("renders acknowledgement state and forwards acknowledgement actions", () => {
    const onAcknowledge = vi.fn();
    render(<StudentAnnouncementsInbox
      items={[
        { id: "notice-1", title: "Exam schedule", message: "Starts at 10.", createdAt: "2026-11-10T08:00:00.000Z", publishedAt: "2026-11-10T08:00:00.000Z", expiresAt: null, seenAt: null, acknowledgedAt: null },
        { id: "notice-2", title: "Venue update", message: "Room 2.", createdAt: "2026-11-10T07:00:00.000Z", publishedAt: "2026-11-10T07:00:00.000Z", expiresAt: null, seenAt: "2026-11-10T08:00:00.000Z", acknowledgedAt: "2026-11-10T08:00:00.000Z" },
      ]}
      onRefresh={vi.fn()}
      onAcknowledge={onAcknowledge}
    />);
    expect(screen.getByRole("heading", { name: "Announcements" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Acknowledged");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(onAcknowledge).toHaveBeenCalledWith("notice-1");
  });
});
