import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminStudents from "./AdminStudents";

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}
const pendingStudent = {
  id: 41, email: "pending@student.test", fullName: "Pending Student", collegeName: "Polytechnic",
  collegeCode: "010", postalPin: "533001", branchName: "Computer Engineering", branchCode: "CM",
  registrationNumber: "24010-CM-041", accessStatus: "PENDING", createdAt: "2026-11-20T00:00:00.000Z",
};
const approvedStudent = { ...pendingStudent, id: 42, email: "approved@student.test", fullName: "Approved Student", registrationNumber: "24010-CM-042", accessStatus: "APPROVED" };

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("combined student approval and management", () => {
  it("filters between pending and approved/rejected accounts", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin/students") {
        const student = url.searchParams.get("status") === "APPROVED" ? approvedStudent : pendingStudent;
        return Promise.resolve(response({ students: [student], page: 1, limit: 25, total: 1, totalPages: 1, statusCounts: { PENDING: 1, APPROVED: 0, REJECTED: 1 } }));
      }
      return Promise.resolve(response({ ok: true, student: { id: 42, accessStatus: "APPROVED" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminStudents onError={vi.fn()} onNotice={vi.fn()} />);
    expect(await screen.findByText("pending@student.test")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter student status" }), { target: { value: "APPROVED" } });
    expect(await screen.findByText("approved@student.test")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("status=APPROVED"), expect.objectContaining({ credentials: "include" }));
  });

  it("passes college and branch filters to the student directory API", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => { void input; return Promise.resolve(response({ students: [], page: 1, limit: 25, total: 0, totalPages: 1, statusCounts: { PENDING: 0, APPROVED: 0, REJECTED: 0 } })); });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminStudents onError={vi.fn()} onNotice={vi.fn()} />);
    await screen.findByText("No students found");
    fireEvent.change(screen.getByRole("textbox", { name: "Filter by college" }), { target: { value: "Polytechnic" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Filter by branch" }), { target: { value: "Computer" } });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
      expect(urls.some((url) => url.searchParams.get("college") === "Polytechnic" && url.searchParams.get("branch") === "Computer")).toBe(true);
    });
  });

  it("approves selected pending accounts in bulk", async () => {
    const second = { ...pendingStudent, id: 43, email: "pending-two@student.test", registrationNumber: "24010-CM-043" };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin/students") return Promise.resolve(response({ students: [pendingStudent, second], page: 1, limit: 25, total: 2, totalPages: 1, statusCounts: { PENDING: 2, APPROVED: 0, REJECTED: 0 } }));
      if (url.pathname === "/admin/students/access/bulk" && init?.method === "PATCH") return Promise.resolve(response({ ok: true, approvedCount: 2 }));
      return Promise.resolve(response({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminStudents onError={vi.fn()} onNotice={vi.fn()} />);
    expect(await screen.findByText("pending-two@student.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select pending@student.test" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select pending-two@student.test" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected (2)" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/admin/students/access/bulk"), expect.objectContaining({ method: "PATCH" })));
  });
});
