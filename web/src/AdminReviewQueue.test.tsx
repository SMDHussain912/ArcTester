import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminReviewQueue, { type ReviewQueueItem } from "./AdminReviewQueue";

const item: ReviewQueueItem = { submissionId: "submission-1", assignmentId: "assignment-1", studentId: 8, studentEmail: "student@example.test", examTitle: "AP ECET Mock", submittedAt: "2026-11-10T08:00:00.000Z", receivedAt: "2026-11-10T08:00:01.000Z", score: null, maximumScore: 100 };

describe("AdminReviewQueue", () => {
  it("renders the empty queue state", () => {
    render(<AdminReviewQueue items={[]} busy={false} onRefresh={vi.fn()} onRelease={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Review queue" })).toBeTruthy();
    expect(screen.getByText("No submissions are waiting for review.")).toBeTruthy();
  });

  it("renders pending submission details and delegates approval", () => {
    const onRelease = vi.fn();
    render(<AdminReviewQueue items={[item]} busy={false} onRefresh={vi.fn()} onRelease={onRelease} />);
    expect(screen.getByText("AP ECET Mock")).toBeTruthy();
    expect(screen.getByText("student@example.test · " + new Date(item.submittedAt).toLocaleString())).toBeTruthy();
    expect(screen.getByText("Score: Pending / 100")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve & release" }));
    expect(onRelease).toHaveBeenCalledWith("submission-1");
  });

  it("disables approval while busy and delegates refresh", () => {
    const onRefresh = vi.fn();
    render(<AdminReviewQueue items={[item]} busy={true} onRefresh={onRefresh} onRelease={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Approve & release" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
