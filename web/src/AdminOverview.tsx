export type AdminOverviewExam = { id: string; title: string; status: string };
export type AdminOverviewSubject = { id: number; name: string; count: number };
type AdminOverviewProps = {
  stats: { subjects: number; topics: number; questions: number };
  exams: AdminOverviewExam[];
  invitationsCount: number;
  catalog: AdminOverviewSubject[];
  onNavigate: (tab: "builder" | "subjects" | "import" | "questions") => void;
};

export default function AdminOverview({ stats, exams, invitationsCount, catalog, onNavigate }: AdminOverviewProps) {
  const publishedCount = exams.filter((exam) => exam.status === "PUBLISHED").length;
  return (
    <>
      <div className="admin-hero"><div><p className="eyebrow">EXAMINER WORKSPACE</p><h1>Build better exams.</h1><p>Manage your question bank, assemble balanced papers, and publish mock tests from one control room.</p></div><button className="primary" onClick={() => onNavigate("builder")}>＋ Create mock test</button></div>
      <div className="admin-stat-grid"><article><span>Questions in bank</span><b>{stats.questions.toLocaleString()}</b><small>Across all subjects</small></article><article><span>Subjects</span><b>{stats.subjects}</b><small>{stats.topics} topics mapped</small></article><article><span>Mock tests</span><b>{exams.length}</b><small>{publishedCount} published</small></article><article><span>Students invited</span><b>{invitationsCount}</b><small>Access management</small></article></div>
      <div className="admin-two-col"><section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow">QUESTION BANK</p><h2>Subject coverage</h2></div><button className="text-button" onClick={() => onNavigate("subjects")}>Manage subjects →</button></div>{catalog.map((subject) => <div className="coverage-row" key={subject.id}><span>{subject.name}</span><b>{subject.count}</b><div><i style={{ width: `${Math.min(100, stats.questions ? subject.count / stats.questions * 100 : 0)}%` }} /></div></div>)}</section>
        <section className="admin-panel"><div className="admin-panel-head"><div><p className="eyebrow">QUICK ACTIONS</p><h2>Examiner tools</h2></div></div><button className="quick-action" onClick={() => onNavigate("import")}>⇧ <span><b>Upload questions</b><small>CSV or JSON, with row-level validation</small></span>→</button><button className="quick-action" onClick={() => onNavigate("questions")}>▤ <span><b>Review question bank</b><small>Filter, inspect and remove unused questions</small></span>→</button><button className="quick-action" onClick={() => onNavigate("builder")}>✦ <span><b>Build a mock paper</b><small>Manual selection or subject-wise random draw</small></span>→</button></section></div>
    </>
  );
}
