type StudentQuestionBankStatsProps = {
  bank: { total: number; subjects: unknown[] } | null;
  visible: boolean;
};

export default function StudentQuestionBankStats({
  bank,
  visible,
}: StudentQuestionBankStatsProps) {
  return (
    <div hidden={!visible} className="stats-row">
      <article className="panel stat">
        <span className="muted">Question bank</span>
        <strong>{bank?.total ?? "—"}</strong>
        <span className="muted">Available questions</span>
      </article>
      <article className="panel stat">
        <span className="muted">Subjects</span>
        <strong>{bank?.subjects.length ?? "—"}</strong>
        <span className="muted">In your question bank</span>
      </article>
    </div>
  );
}
