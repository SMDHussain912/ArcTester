type AssignedExamPreviewItem = {
  id: string;
  exam: { title: string };
  version: number;
  questionCount: number;
  durationMinutes: number;
  availableFrom: string | null;
  dueAt: string | null;
  submission: unknown;
};

interface StudentAssignedExamPreviewProps {
  assignments: AssignedExamPreviewItem[];
  onViewAll: () => void;
}

export default function StudentAssignedExamPreview({
  assignments,
  onViewAll,
}: StudentAssignedExamPreviewProps) {
  const pendingAssignments = assignments.filter((item) => !item.submission);
  if (pendingAssignments.length === 0) return null;

  return (
    <section className="panel student-notice-preview" aria-labelledby="upcoming-exams-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">EXAM CENTRE</p>
          <h2 id="upcoming-exams-title">Your assigned exams</h2>
          <p className="muted">{pendingAssignments.length} exam{pendingAssignments.length === 1 ? "" : "s"} awaiting submission</p>
        </div>
        <button type="button" className="ghost" onClick={onViewAll}>View all exams →</button>
      </div>
      <div className="grid two">
        {pendingAssignments.slice(0, 3).map((item) => {
          const unavailable = item.availableFrom && new Date(item.availableFrom).getTime() > Date.now();
          const expired = item.dueAt && new Date(item.dueAt).getTime() < Date.now();
          return (
            <article className="panel assigned-exam-card" key={item.id}>
              <div className="admin-exam-meta">
                <div><strong>{item.exam.title}</strong><p className="muted">Version {item.version} · {item.questionCount} questions · {item.durationMinutes} min</p></div>
                <span className={expired ? "status status-expired" : unavailable ? "status status-pending" : "status status-used"}>{expired ? "EXPIRED" : unavailable ? "UPCOMING" : "READY"}</span>
              </div>
              <p className="muted">Available: {item.availableFrom ? new Date(item.availableFrom).toLocaleString() : "Immediately"}</p>
              <p className="muted">Deadline: {item.dueAt ? new Date(item.dueAt).toLocaleString() : "No deadline"}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
