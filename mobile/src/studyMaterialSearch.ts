export type StudyMaterialSummary = {
  id: string;
  title: string;
  description: string;
  subject: string;
  topic: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export function searchStudyMaterials(materials: StudyMaterialSummary[], query: string): StudyMaterialSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return materials;
  return materials.filter((item) =>
    [item.title, item.description, item.subject, item.topic, item.fileName]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

export function studyMaterialFormat(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "text/markdown") return "Markdown";
  if (mimeType === "text/plain") return "Text";
  return "File";
}
