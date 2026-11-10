export type AdminCatalogSubject = {
  id: number;
  name: string;
  count: number;
  topics: { id: number; name: string; _count: { questions: number } }[];
};

type AdminSubjectsProps = { catalog: AdminCatalogSubject[]; onRefresh: () => void };

export default function AdminSubjects({ catalog, onRefresh }: AdminSubjectsProps) {
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">SYLLABUS ORGANISATION</p><h1>Subjects &amp; topics</h1><p>Subject and topic structure is created automatically as questions are imported.</p></div><button className="ghost" onClick={onRefresh}>Refresh catalog</button></div>
      <div className="subject-admin-grid">{catalog.map((subject) => <article className="admin-panel" key={subject.id}><div className="subject-admin-head"><div><h2>{subject.name}</h2><small>{subject.count} questions</small></div><span>{subject.topics.length} topics</span></div>{subject.topics.map((topic) => <div className="topic-row" key={topic.id}>{topic.name}<span>{topic._count.questions} questions</span></div>)}</article>)}</div>
    </>
  );
}
