import type { FormEvent } from "react";

export type AdminQuestionForm = { subject: string; topic: string; text: string; a: string; b: string; c: string; d: string; correctIndex: string; difficulty: string; explanation: string; source: string };
export type AdminQuestionFormField = keyof AdminQuestionForm;
type AdminQuestionEditorProps = {
  form: AdminQuestionForm;
  editing: boolean;
  busy: boolean;
  onChange: (field: AdminQuestionFormField, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
};

export default function AdminQuestionEditor({ form, editing, busy, onChange, onSubmit, onBack }: AdminQuestionEditorProps) {
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">QUESTION AUTHORING</p><h1>{editing ? "Edit question" : "Add a question"}</h1><p>Write a complete MCQ, set its answer key and attach it to the right subject and topic.</p></div><button className="ghost" onClick={onBack}>Back to bank</button></div>
      <form className="admin-panel question-editor" onSubmit={onSubmit}>
        <div className="builder-fields"><label>Subject<input required value={form.subject} onChange={(event) => onChange("subject", event.target.value)} /></label><label>Topic<input required value={form.topic} onChange={(event) => onChange("topic", event.target.value)} /></label><label>Difficulty<select value={form.difficulty} onChange={(event) => onChange("difficulty", event.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></div>
        <label>Question text<textarea required value={form.text} onChange={(event) => onChange("text", event.target.value)} placeholder="Enter the full question statement…" /></label>
        <div className="option-editor-grid">{(["a", "b", "c", "d"] as const).map((key, index) => <label key={key}>Option {String.fromCharCode(65 + index)}<input required value={form[key]} onChange={(event) => onChange(key, event.target.value)} /></label>)}</div>
        <div className="builder-fields"><label>Correct answer<select value={form.correctIndex} onChange={(event) => onChange("correctIndex", event.target.value)}>{[0, 1, 2, 3].map((index) => <option value={index} key={index}>Option {String.fromCharCode(65 + index)}</option>)}</select></label><label>Source / year<input value={form.source} onChange={(event) => onChange("source", event.target.value)} /></label></div>
        <label>Explanation<textarea value={form.explanation} onChange={(event) => onChange("explanation", event.target.value)} /></label>
        <div className="editor-actions"><button type="button" className="ghost" onClick={onBack}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add to question bank"}</button></div>
      </form>
    </>
  );
}
