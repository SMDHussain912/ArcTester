export type ReviewQueueItem = {
  submissionId: string;
  assignmentId: string;
  studentId: number;
  studentEmail: string;
  examTitle: string;
  submittedAt: string;
  receivedAt: string;
  score: number | null;
  maximumScore: number | null;
};

type AdminReviewQueueProps = {
  items: ReviewQueueItem[];
  busy: boolean;
  onRefresh: () => void;
  onRelease: (submissionId: string) => void;
};

export default function AdminReviewQueue({ items, busy, onRefresh, onRelease }: AdminReviewQueueProps) {
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">SUBMISSION CONTROL</p><h1>Review queue</h1><p>Approve submissions that require administrator review.</p></div><button className="ghost" onClick={onRefresh}>Refresh</button></div>
      {items.length === 0 ? <div className="admin-panel"><p>No submissions are waiting for review.</p></div> : items.map((item) => (
        <article className="admin-panel" key={item.submissionId}>
          <h3>{item.examTitle}</h3>
          <p>{item.studentEmail} · {new Date(item.submittedAt).toLocaleString()}</p>
          <p>Score: {item.score ?? "Pending"} / {item.maximumScore ?? "—"}</p>
          <button className="primary" disabled={busy} onClick={() => onRelease(item.submissionId)}>Approve &amp; release</button>
        </article>
      ))}
    </>
  );
}
