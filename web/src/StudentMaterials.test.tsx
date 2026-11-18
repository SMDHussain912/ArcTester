import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentMaterials from "./StudentMaterials";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({
  API: "http://localhost:4000",
  request: vi.fn(),
}));

describe("StudentMaterials", () => {
  beforeEach(() => {
    vi.mocked(request).mockReset();
  });

  it("offers inline preview only for published PDFs", async () => {
    vi.mocked(request).mockResolvedValue({
      materials: [
        {
          id: "pdf-1", title: "Maths notes", description: "Algebra revision",
          subject: "Mathematics", topic: "Algebra", fileName: "maths.pdf",
          mimeType: "application/pdf", sizeBytes: 4096, createdAt: "2026-11-18T00:00:00.000Z",
        },
        {
          id: "text-1", title: "Physics notes", description: "Motion revision",
          subject: "Physics", topic: "Motion", fileName: "physics.md",
          mimeType: "text/markdown", sizeBytes: 1024, createdAt: "2026-11-18T00:00:00.000Z",
        },
      ],
    });

    render(<StudentMaterials setActivePage={vi.fn()} />);

    expect(await screen.findByText("Maths notes")).toBeInTheDocument();
    const preview = screen.getByRole("link", { name: "Preview PDF" });
    expect(preview).toHaveAttribute("href", "http://localhost:4000/study-materials/pdf-1/preview");
    expect(preview).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("link", { name: "Preview PDF", hidden: true })?.getAttribute("href")).not.toContain("text-1");
    await waitFor(() => expect(screen.getByText("Physics notes")).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(2);
  });
});
