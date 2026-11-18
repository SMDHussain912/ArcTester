import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminStudyMaterials, { type StudyMaterial } from "./AdminStudyMaterials";

const material: StudyMaterial = {
  id: "material-1", title: "Data Structures", description: "Unit notes",
  subject: "Computer Science", topic: "Arrays", fileName: "arrays.pdf",
  mimeType: "application/pdf", sizeBytes: 2048, status: "DRAFT",
  createdAt: "2026-11-18T00:00:00.000Z",
};

describe("AdminStudyMaterials", () => {
  it("shows uploaded files and allows publishing or deleting", () => {
    const onStatusChange = vi.fn(), onDelete = vi.fn();
    render(<AdminStudyMaterials materials={[material]} busy={false} onUpload={vi.fn()} onStatusChange={onStatusChange} onDelete={onDelete} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Study materials" })).toBeInTheDocument();
    expect(screen.getByText("Data Structures")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onStatusChange).toHaveBeenCalledWith("material-1", "PUBLISHED");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("material-1");
  });

  it("validates file type and metadata before upload", async () => {
    const onUpload = vi.fn();
    render(<AdminStudyMaterials materials={[]} busy={false} onUpload={onUpload} onStatusChange={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Material title"), { target: { value: "Unit 1 Notes" } });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Computer Science" } });
    const file = new File(["notes"], "notes.exe", { type: "application/octet-stream" });
    fireEvent.change(screen.getByLabelText(/File/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload as draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only PDF, plain text and Markdown files are supported.");
    expect(onUpload).not.toHaveBeenCalled();
  });
});
