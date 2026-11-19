import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminQuestionImport, { type AdminImportReport } from "./AdminQuestionImport";

const report: AdminImportReport = { added: 8, duplicates: 2, invalid: [{ row: 4, reason: "Missing option D" }], total: 11 };
const props = { uploadText: "subject,topic", uploadFormat: "csv" as const, previewReady: false, report: null, busy: false, onReadFile: vi.fn(), onTextChange: vi.fn(), onFormatChange: vi.fn(), onLoadExample: vi.fn(), onDownloadTemplate: vi.fn(), onPreview: vi.fn(), onConfirm: vi.fn(), onCancelPreview: vi.fn() };

describe("AdminQuestionImport", () => {
  it("renders source controls, CSV schema and text editor", () => {
    render(<AdminQuestionImport {...props} />);
    expect(screen.getByRole("heading", { name: "Upload question sets" })).toBeTruthy();
    expect(screen.getByText(/optionA, optionB, optionC, optionD/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/File contents appear here/)).toBeTruthy();
  });

  it("opens the file picker with Enter and Space from the keyboard", () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    render(<AdminQuestionImport {...props} />);
    const dropZone = screen.getByRole("button", { name: "Choose CSV or JSON file" });
    fireEvent.keyDown(dropZone, { key: "Enter" });
    fireEvent.keyDown(dropZone, { key: " " });
    expect(clickSpy).toHaveBeenCalledTimes(2);
    clickSpy.mockRestore();
  });

  it("delegates format, text, preview and template actions", () => {
    const handlers = { onTextChange: vi.fn(), onFormatChange: vi.fn(), onPreview: vi.fn(), onDownloadTemplate: vi.fn(), onLoadExample: vi.fn() };
    render(<AdminQuestionImport {...props} {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.change(screen.getByPlaceholderText(/File contents appear here/), { target: { value: "[]" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    fireEvent.click(screen.getByRole("button", { name: "Download CSV template" }));
    fireEvent.click(screen.getByRole("button", { name: "Load CSV example" }));
    expect(handlers.onFormatChange).toHaveBeenCalledWith("json");
    expect(handlers.onTextChange).toHaveBeenCalledWith("[]");
    expect(handlers.onPreview).toHaveBeenCalledTimes(1);
    expect(handlers.onDownloadTemplate).toHaveBeenCalledWith("csv");
    expect(handlers.onLoadExample).toHaveBeenCalledTimes(1);
  });

  it("shows validation report and confirms or cancels a prepared import", () => {
    const onConfirm = vi.fn(), onCancelPreview = vi.fn();
    const { rerender } = render(<AdminQuestionImport {...props} previewReady={true} report={report} onConfirm={onConfirm} onCancelPreview={onCancelPreview} />);
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Row 4: Missing option D")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel preview" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancelPreview).toHaveBeenCalledTimes(1);
    rerender(<AdminQuestionImport {...props} busy={true} />);
    expect(screen.getByRole("button", { name: "Validating…" }).hasAttribute("disabled")).toBe(true);
  });
});
