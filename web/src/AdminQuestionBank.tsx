export type AdminBankQuestion = { id: number; subject: string; topic: string; text: string; options: string[]; correctIndex: number; explanation: string; source: string; difficulty: string };
export type AdminQuestionCatalogSubject = { id: number; name: string; count: number; topics: { id: number; name: string; _count: { questions: number } }[] };
type Topic = { id: number; name: string; _count: { questions: number } };

type AdminQuestionBankProps = {
  questions: AdminBankQuestion[];
  total: number;
  page: number;
  query: string;
  subject: string;
  topic: string;
  difficulty: string;
  catalog: AdminQuestionCatalogSubject[];
  filteredTopics: Topic[];
  selected: number[];
  busy: boolean;
  onQueryChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onTopicChange: (value: string) => void;
  onDifficultyChange: (value: string) => void;
  onToggleSelected: (id: number) => void;
  onDeleteSelected: () => void;
  onEditQuestion: (question: AdminBankQuestion) => void;
  onUpload: () => void;
  onPageChange: (page: number) => void;
};

export default function AdminQuestionBank({ questions, total, page, query, subject, topic, difficulty, catalog, filteredTopics, selected, busy, onQueryChange, onSubjectChange, onTopicChange, onDifficultyChange, onToggleSelected, onDeleteSelected, onEditQuestion, onUpload, onPageChange }: AdminQuestionBankProps) {
  const pageCount = Math.max(1, Math.ceil(total / 25));
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">CONTENT MANAGEMENT</p><h1>Question bank</h1><p>Search, filter, inspect and curate every MCQ. Correct answers stay hidden from students.</p></div><button className="primary" onClick={onUpload}>＋ Upload questions</button></div>
      <div className="admin-toolbar">
        <input placeholder="Search question text or explanation…" value={query} onChange={(event) => onQueryChange(event.target.value)} />
        <select value={subject} onChange={(event) => onSubjectChange(event.target.value)}><option value="">All subjects</option>{catalog.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
        <select value={topic} onChange={(event) => onTopicChange(event.target.value)}><option value="">All topics</option>{filteredTopics.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
        <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)}><option value="">All difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
      </div>
      <div className="admin-panel table-panel">
        <div className="table-top"><span>{total.toLocaleString()} questions found</span><button className="ghost danger-button" disabled={!selected.length || busy} onClick={onDeleteSelected}>Delete selected ({selected.length})</button></div>
        {questions.length === 0 ? <div className="empty-state"><b>No questions match these filters</b><span>Upload a question set or add the first question.</span></div> : questions.map((question) => (
          <article className="bank-question" key={question.id}>
            <input type="checkbox" aria-label={`Select question ${question.id}`} checked={selected.includes(question.id)} onChange={() => onToggleSelected(question.id)} />
            <div className="bank-q-main"><div className="bank-q-meta"><b>{question.subject}</b><span>{question.topic}</span><span className={`difficulty ${question.difficulty}`}>{question.difficulty}</span></div>
              <p>{question.text}</p><div className="bank-options">{question.options.map((option, index) => <span className={index === question.correctIndex ? "correct-option" : ""} key={index}>{String.fromCharCode(65 + index)}. {option}{index === question.correctIndex ? " ✓" : ""}</span>)}</div>
              {question.explanation && <small className="muted">Explanation: {question.explanation}</small>}<button className="text-button edit-question" onClick={() => onEditQuestion(question)}>Edit question</button>
            </div>
          </article>
        ))}
      </div>
      <div className="pagination"><button className="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Previous</button><span>Page {page} of {pageCount}</span><button className="ghost" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next →</button></div>
    </>
  );
}
