import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminStudentPicker from "./AdminStudentPicker";

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}
const students = [
  { id: 104, email: "maya@student.test", fullName: "Maya Student", collegeName: "Polytechnic", branchName: "Computer Engineering", accessStatus: "APPROVED" },
  { id: 118, email: "arun@student.test", fullName: "Arun Student", collegeName: "Polytechnic", branchName: "Electrical Engineering", accessStatus: "APPROVED" },
];

afterEach(() => vi.unstubAllGlobals());

function Harness() { const [value, setValue] = useState(""); return <AdminStudentPicker value={value} onChange={setValue}/>; }

describe("admin selected-student audience picker", () => {
  it("searches approved students, preserves selections, and removes selected accounts", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const q = url.searchParams.get("q")?.toLowerCase() ?? "";
      return Promise.resolve(response({ students: students.filter((student) => !q || student.fullName.toLowerCase().includes(q) || student.email.includes(q)) }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);

    expect(await screen.findByText("Maya Student")).toBeInTheDocument();
    expect(screen.getByText("Arun Student")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Maya Student/ }));
    expect(await screen.findByRole("button", { name: "Remove student 104" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Arun" } });
    expect(await screen.findByText("Arun Student")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Arun Student/ }));
    expect(await screen.findByRole("button", { name: "Remove student 118" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove student 104" }));
    expect(screen.queryByRole("button", { name: "Remove student 104" })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("status=APPROVED"), expect.anything()));
  });
});
