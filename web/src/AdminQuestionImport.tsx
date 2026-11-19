import { useRef, useState } from "react";

export type AdminImportReport = { added: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number };
type AdminQuestionImportProps = {
  uploadText: string;
  uploadFormat: "csv" | "json";
  previewReady: boolean;
  report: AdminImportReport | null;
  busy: boolean;
  onReadFile: (file: File) => void | Promise<void>;
  onTextChange: (value: string) => void;
  onFormatChange: (value: "csv" | "json") => void;
  onLoadExample: () => void;
  onDownloadTemplate: (format: "csv" | "json") => void;
  onPreview: () => void;
  onConfirm: () => void;
  onCancelPreview: () => void;
};

export default function AdminQuestionImport({ uploadText, uploadFormat, previewReady, report, busy, onReadFile, onTextChange, onFormatChange, onLoadExample, onDownloadTemplate, onPreview, onConfirm, onCancelPreview }: AdminQuestionImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">BULK QUESTION INGESTION</p><h1>Upload question sets</h1><p>Import thousands of questions, validate every row, and see duplicates before you move on.</p></div></div>
      <div className="admin-two-col import-layout">
        <section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow">STEP 1 · SOURCE</p><h2>Choose a file</h2></div></div>
          <div role="button" tabIndex={0} aria-label="Choose CSV or JSON file" className={dragging ? "drop-zone dragging" : "drop-zone"} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileRef.current?.click(); } }} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const selected = event.dataTransfer.files[0]; if (selected) void onReadFile(selected); }} onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void onReadFile(selected); }} />
            <span className="upload-icon">⇧</span><b>Drop CSV or JSON file here</b><small>or click to browse your device</small><em>CSV · JSON · Up to 8 MB</em>
          </div>
          <div className="format-note"><b>CSV columns</b><code>subject, topic, text, optionA, optionB, optionC, optionD, correctIndex, explanation, source, difficulty</code><button className="text-button" onClick={(event) => { event.stopPropagation(); onLoadExample(); }}>Load CSV example</button><div className="template-actions"><button className="ghost" onClick={() => onDownloadTemplate("csv")}>Download CSV template</button><button className="ghost" onClick={() => onDownloadTemplate("json")}>Download JSON template</button></div></div>
        </section>
        <section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow">STEP 2 · REVIEW</p><h2>Preview and import</h2></div></div>
          <div className="segmented"><button className={uploadFormat === "csv" ? "chosen" : ""} onClick={() => onFormatChange("csv")}>CSV</button><button className={uploadFormat === "json" ? "chosen" : ""} onClick={() => onFormatChange("json")}>JSON</button></div>
          <textarea className="import-editor" value={uploadText} onChange={(event) => onTextChange(event.target.value)} placeholder="File contents appear here. You can also paste your question data…" />
          <button className="primary full" disabled={!uploadText.trim() || busy} onClick={previewReady ? onConfirm : onPreview}>{busy ? (previewReady ? "Importing…" : "Validating…") : previewReady ? "Confirm import" : "Preview import"}</button>
          {previewReady && <button className="ghost full" onClick={onCancelPreview}>Cancel preview</button>}
          {report && <div className="import-report"><div><b>{report.added}</b><small>Added</small></div><div><b>{report.duplicates}</b><small>Duplicates</small></div><div><b>{report.invalid.length}</b><small>Invalid rows</small></div>{report.invalid.slice(0, 12).map((item) => <p key={item.row}>Row {item.row}: {item.reason}</p>)}</div>}
        </section>
      </div>
    </>
  );
}
