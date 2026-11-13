export type AdminManagedExam = { id: string; title: string; status: string; versions: { version: number; durationMinutes: number; publishedAt: string | null; _count: { questions: number; assignments: number } }[] };
export type AdminExamStudent = { id: number; email: string; createdAt: string };
export type AdminExamPreview = { version: number; title: string; questions: { id: string; position: number; subject: string; topic: string | null; marks: number; negativeMarks: number; text: string; options: string[]; correctIndex: number; explanation: string | null }[]; durationMinutes: number; instructions: string | null };
type AdminExamManagementProps = {
  exams: AdminManagedExam[];
  students: AdminExamStudent[];
  assignmentExam: string | null;
  assignedStudents: number[];
  availableFrom: string;
  dueAt: string;
  preview: AdminExamPreview | null;
  busy: boolean;
  onNewExam: () => void;
  onPreview: (id: string) => void;
  onPublish: (id: string) => void;
  onToggleAssignment: (id: string) => void;
  onToggleStudent: (id: number, checked: boolean) => void;
  onAvailableFromChange: (value: string) => void;
  onDueAtChange: (value: string) => void;
  onCancelAssignment: () => void;
  onAssign: () => void;
  onClosePreview: () => void;
};

export default function AdminExamManagement({ exams, students, assignmentExam, assignedStudents, availableFrom, dueAt, preview, busy, onNewExam, onPreview, onPublish, onToggleAssignment, onToggleStudent, onAvailableFromChange, onDueAtChange, onCancelAssignment, onAssign, onClosePreview }: AdminExamManagementProps) {
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">PUBLISHED PAPERS &amp; DRAFTS</p><h1>Exam management</h1><p>Review every paper version, inspect its question count, and publish when it is ready.</p></div><button className="primary" onClick={onNewExam}>＋ New mock test</button></div>
      <div className="exam-list">{exams.map((exam) => { const version = exam.versions[0]; return (
        <article className="admin-panel exam-row" key={exam.id}>
          <div><span className={exam.status === "PUBLISHED" ? "status status-used" : "status"}>{exam.status}</span><h3>{exam.title}</h3><p>{version ? `${version._count.questions} questions · ${version.durationMinutes} minutes · ${version._count.assignments} assignments` : "No version"}</p></div>
          <div className="exam-actions"><button className="ghost" onClick={() => onPreview(exam.id)}>Preview paper</button>{version && !version.publishedAt ? <button className="primary" onClick={() => onPublish(exam.id)}>Publish version {version.version}</button> : <><span className="success">Published</span><button className="ghost" onClick={() => onToggleAssignment(exam.id)}>Assign students</button></>}</div>
          {assignmentExam === exam.id && <div className="assignment-panel"><b>Assign this paper</b><div className="student-picker">{students.map((student) => <label key={student.id}><input type="checkbox" checked={assignedStudents.includes(student.id)} onChange={(event) => onToggleStudent(student.id, event.target.checked)} />{student.email}</label>)}</div><div className="builder-fields"><label>Available from<input type="datetime-local" value={availableFrom} onChange={(event) => onAvailableFromChange(event.target.value)} /></label><label>Due date<input type="datetime-local" value={dueAt} onChange={(event) => onDueAtChange(event.target.value)} /></label></div><div className="editor-actions"><button className="ghost" onClick={onCancelAssignment}>Cancel</button><button className="primary" disabled={!assignedStudents.length || busy} onClick={onAssign}>Assign to {assignedStudents.length} student(s)</button></div></div>}
        </article>
      ); })}{!exams.length && <div className="admin-panel empty-state">No mock tests yet. Start by building your first paper.</div>}</div>
      {preview && <div className="preview-backdrop" onClick={onClosePreview}><section className="preview-modal" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">EXAMINER REVIEW · VERSION {preview.version}</p><h2>{preview.title}</h2><p>{preview.questions.length} questions · {preview.durationMinutes} minutes · {preview.questions.reduce((sum, question) => sum + question.marks, 0)} maximum marks</p></div><button className="icon-button" onClick={onClosePreview}>×</button></header><div className="preview-instructions"><b>Instructions</b><p>{preview.instructions || "No instructions configured."}</p></div><div className="preview-questions">{preview.questions.map((question) => <article key={question.id}><div><b>Q{question.position + 1} · {question.subject}{question.topic ? " / " + question.topic : ""}</b><small>+{question.marks} / −{question.negativeMarks}</small></div><p>{question.text}</p><ol type="A">{question.options.map((option, index) => <li className={index === question.correctIndex ? "preview-correct" : ""} key={index}>{option}{index === question.correctIndex ? " ✓" : ""}</li>)}</ol>{question.explanation && <small className="muted">Explanation: {question.explanation}</small>}</article>)}</div></section></div>}
    </>
  );
}
