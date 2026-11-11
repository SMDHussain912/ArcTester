import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminAttendanceRegister, { type AttendanceRow } from "./AdminAttendanceRegister";

const rows: AttendanceRow[] = [
  {
    assignmentId: "assignment-1", candidate: { id: 7, email: "not-started@example.test" },
    exam: { id: "exam-1", title: "AP ECET Mock" }, version: 2, questionCount: 100,
    assignedAt: "2026-11-10T08:00:00.000Z", availableFrom: null, dueAt: null,
    attendanceStatus: "NOT_STARTED", connectivity: "NOT_STARTED", session: null, submission: null,
  },
  {
    assignmentId: "assignment-2", candidate: { id: 8, email: "submitted@example.test" },
    exam: { id: "exam-1", title: "AP ECET Mock" }, version: 2, questionCount: 100,
    assignedAt: "2026-11-10T08:00:00.000Z", availableFrom: "2026-11-10T09:00:00.000Z", dueAt: "2026-11-10T12:00:00.000Z",
    attendanceStatus: "SUBMITTED", connectivity: "STALE_OR_INACTIVE", session: null,
    submission: { id: "submission-1", status: "GRADED", submittedAt: "2026-11-10T11:00:00.000Z", score: 82, maximumScore: 100 },
  },
];

describe("AdminAttendanceRegister", () => {
  it("shows not-started candidates and submitted results in the same register", () => {
    render(<AdminAttendanceRegister rows={rows} total={2} page={1} pageSize={25} loading={false} updatedAt="2026-11-10T12:00:00.000Z" onPageChange={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Attendance register" })).toBeTruthy();
    expect(screen.getByText("not-started@example.test")).toBeTruthy();
    expect(screen.getAllByText("NOT STARTED")).toHaveLength(2);
    expect(screen.getByText("No session started")).toBeTruthy();
    expect(screen.getByText("submitted@example.test")).toBeTruthy();
    expect(screen.getByText("SUBMITTED")).toBeTruthy();
    expect(screen.getByText("82 / 100")).toBeTruthy();
  });

  it("delegates refresh and pagination while respecting the page boundaries", () => {
    const onPageChange = vi.fn(), onRefresh = vi.fn();
    render(<AdminAttendanceRegister rows={rows} total={60} page={2} pageSize={25} loading={false} updatedAt={null} onPageChange={onPageChange} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh attendance" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("shows loading and empty states", () => {
    const { rerender } = render(<AdminAttendanceRegister rows={[]} total={0} page={1} pageSize={25} loading={true} updatedAt={null} onPageChange={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("Loading attendance");
    rerender(<AdminAttendanceRegister rows={[]} total={0} page={1} pageSize={25} loading={false} updatedAt={null} onPageChange={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByText("No exam assignments have been created yet.")).toBeTruthy();
  });
});
