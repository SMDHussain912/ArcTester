import { describe, expect, it } from "vitest";
import { searchStudyMaterials, studyMaterialFormat, type StudyMaterialSummary } from "./studyMaterialSearch";

const materials: StudyMaterialSummary[] = [
  { id: "1", title: "Data Structures", description: "Arrays and linked lists", subject: "Computer Science", topic: "DS", fileName: "ds.pdf", mimeType: "application/pdf", sizeBytes: 2048, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "2", title: "Database Notes", description: "SQL joins and indexes", subject: "DBMS", topic: "SQL", fileName: "db.md", mimeType: "text/markdown", sizeBytes: 1024, createdAt: "2026-01-02T00:00:00.000Z" },
];

describe("study material search", () => {
  it("returns all materials for an empty query", () => {
    expect(searchStudyMaterials(materials, "  ")).toEqual(materials);
  });

  it("matches title, description, subject, topic and filename without case sensitivity", () => {
    expect(searchStudyMaterials(materials, "COMPUTER")).toEqual([materials[0]]);
    expect(searchStudyMaterials(materials, "indexes")).toEqual([materials[1]]);
    expect(searchStudyMaterials(materials, "sql")).toEqual([materials[1]]);
    expect(searchStudyMaterials(materials, ".PDF")).toEqual([materials[0]]);
  });

  it("returns no results for unmatched text", () => {
    expect(searchStudyMaterials(materials, "robotics")).toEqual([]);
  });

  it("labels supported material formats safely", () => {
    expect(studyMaterialFormat("application/pdf")).toBe("PDF");
    expect(studyMaterialFormat("text/markdown")).toBe("Markdown");
    expect(studyMaterialFormat("text/plain")).toBe("Text");
    expect(studyMaterialFormat("application/octet-stream")).toBe("File");
  });
});
