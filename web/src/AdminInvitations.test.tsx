import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminInvitations, { type StudentAccessRow } from "./AdminInvitations";

const students: StudentAccessRow[] = [
  { id: 1, email: "pending@example.test", accessStatus: "PENDING", createdAt: "2026-11-20T10:00:00.000Z" },
  { id: 2, email: "approved@example.test", accessStatus: "APPROVED", createdAt: "2026-11-19T10:00:00.000Z" },
  { id: 3, email: "rejected@example.test", accessStatus: "REJECTED", createdAt: "2026-11-18T10:00:00.000Z" },
];

afterEach(() => vi.restoreAllMocks());

describe("student access approvals", () => {
  it("shows account status, filters and one-click approval", () => {
    const onChangeStatus = vi.fn();
    render(<AdminInvitations students={students} busy={false} onRefresh={vi.fn()} onChangeStatus={onChangeStatus} onBulkApprove={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Student approvals" })).toBeTruthy();
    expect(screen.getByText("pending@example.test")).toBeTruthy();
    expect(screen.getByText("approved@example.test")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onChangeStatus).toHaveBeenCalledWith(1, "APPROVED");
    fireEvent.change(screen.getByLabelText("Filter student approval status"), { target: { value: "REJECTED" } });
    expect(screen.getByText("rejected@example.test")).toBeTruthy();
    expect(screen.queryByText("pending@example.test")).toBeNull();
  });

  it("searches student accounts by email", () => {
    render(<AdminInvitations students={students} busy={false} onRefresh={vi.fn()} onChangeStatus={vi.fn()} onBulkApprove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search student email"), { target: { value: "approved@" } });
    expect(screen.getByText("approved@example.test")).toBeTruthy();
    expect(screen.queryByText("pending@example.test")).toBeNull();
  });

  it("confirms and bulk approves selected students", () => {
    const onBulkApprove = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminInvitations students={students} busy={false} onRefresh={vi.fn()} onChangeStatus={vi.fn()} onBulkApprove={onBulkApprove} />);
    fireEvent.click(screen.getByLabelText("Select pending@example.test"));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected (1)" }));
    expect(onBulkApprove).toHaveBeenCalledWith([1]);
  });
});
