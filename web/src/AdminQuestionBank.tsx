import { useState } from "react";
export type AdminBankQuestion = { id: number; subject: string; topic: string; text: string; options: string[]; correctIndex: number; explanation: string; source: string; difficulty: string; reviewStatus?: "DRAFT" | "APPROVED" | "REJECTED" };
export type QuestionReviewProgress = { subjects: Array<{ subject: string; paperQuota: number; requiredQuota: number; drafted: number; approved: number; rejected: number; remaining: number }>; totals: { drafted: number; approved: number; rejected: number; requiredQuota: number; remaining: number } };
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
  reviewStatus?: string;
  reviewProgress?: QuestionReviewProgress | null;
  onReviewStatusChange?: (value: string) => void;
  onReviewQuestion?: (id: number, status: "APPROVED" | "REJECTED", source: string) => void;
  onBulkReview?: (status: "APPROVED" | "REJECTED") => void;
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
  onBulkDifficultyChange: (difficulty: "easy" | "medium" | "hard") => void;
  onEditQuestion: (question: AdminBankQuestion) => void;
  onUpload: () => void;
  onPageChange: (page: number) => void;
};

export default function AdminQuestionBank({ questions, total, page, query, subject, topic, difficulty, reviewStatus = "", reviewProgress = null, onReviewStatusChange = () => {}, onReviewQuestion = () => {}, onBulkReview = () => {}, catalog, filteredTopics, selected, busy, onQueryChange, onSubjectChange, onTopicChange, onDifficultyChange, onToggleSelected, onDeleteSelected, onBulkDifficultyChange, onEditQuestion, onUpload, onPageChange }: AdminQuestionBankProps) {
  const [bulkDifficulty, setBulkDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [sourceDrafts, setSourceDrafts] = useState<Record<number, string>>({});
  const pageCount = Math.max(1, Math.ceil(total / 25));
  function confirmDeleteSelected() {
    if (!selected.length) return;
    if (!window.confirm(`Delete ${selected.length} selected question(s)? Questions used in historical attempts will be protected.`)) return;
    onDeleteSelected();
  }
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">CONTENT MANAGEMENT</p><h1>Question bank</h1><p>Search, filter, inspect and curate every MCQ. Correct answers stay hidden from students.</p></div><button className="primary" onClick={onUpload}>＋ Upload questions</button></div>
      <div className="admin-toolbar">
        <input placeholder="Search question text or explanation…" value={query} onChange={(event) => onQueryChange(event.target.value)} />
        <select value={subject} onChange={(event) => onSubjectChange(event.target.value)}><option value="">All subjects</option>{catalog.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
        <select value={topic} onChange={(event) => onTopicChange(event.target.value)}><option value="">All topics</option>{filteredTopics.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
        <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)} aria-label="Filter by difficulty"><option value="">All difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
        <select value={reviewStatus} onChange={(event) => onReviewStatusChange(event.target.value)} aria-label="Filter by review status"><option value="">All review statuses</option><option value="DRAFT">Needs review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select>
      </div>
      <section className="admin-panel question-review-progress" aria-label="Question review progress">
        <div><h2>Human review progress</h2><p className="muted">Three times the official AP ECET CSE paper quota is the draft-bank target. Drafts and approved questions count toward coverage; rejected questions do not.</p></div>
        {reviewProgress?.totals && Array.isArray(reviewProgress.subjects) ? <>
          <div className="admin-stat-grid"><article><span>Drafted</span><b>{reviewProgress.totals.drafted.toLocaleString()}</b></article><article><span>Approved</span><b>{reviewProgress.totals.approved.toLocaleString()}</b></article><article><span>Required bank target</span><b>{reviewProgress.totals.requiredQuota.toLocaleString()}</b></article><article><span>Still needed</span><b>{reviewProgress.totals.remaining.toLocaleString()}</b></article></div>
          <div className="table-panel">{reviewProgress.subjects.map((item) => <div className="coverage-row" key={item.subject}><span>{item.subject}</span><b>{item.drafted} drafted · {item.approved} approved / {item.requiredQuota} required</b><small>{item.rejected} rejected · {item.remaining} still needed</small></div>)}</div>
        </> : <p className="muted">Review progress is loading or unavailable.</p>}
      </section>
      <div className="admin-panel table-panel">
        <div className="table-top"><span>{total.toLocaleString()} questions found</span><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="bulk-question-difficulty" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0, 0, 0, 0)" }}>Selected question difficulty</label>
          <select id="bulk-question-difficulty" aria-label="Selected question difficulty" value={bulkDifficulty} onChange={(event) => setBulkDifficulty(event.target.value as "easy" | "medium" | "hard")} disabled={!selected.length || busy}>
            <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </select>
          <button className="ghost" disabled={!selected.length || busy} onClick={() => onBulkDifficultyChange(bulkDifficulty)}>Update difficulty ({selected.length})</button><button className="ghost" disabled={!selected.length || busy} onClick={() => onBulkReview("APPROVED")}>Approve selected</button><button className="ghost" disabled={!selected.length || busy} onClick={() => onBulkReview("REJECTED")}>Reject selected</button>
          <button className="ghost danger-button" disabled={!selected.length || busy} onClick={confirmDeleteSelected}>Delete selected ({selected.length})</button>
        </div></div>
        {questions.length === 0 ? <div className="empty-state"><b>No questions match these filters</b><span>Upload a question set or add the first question.</span></div> : questions.map((question) => (
          <article className="bank-question" key={question.id}>
            <input type="checkbox" aria-label={`Select question ${question.id}`} checked={selected.includes(question.id)} onChange={() => onToggleSelected(question.id)} />
            <div className="bank-q-main"><div className="bank-q-meta"><b>{question.subject}</b><span>{question.topic}</span><span className={`difficulty ${question.difficulty}`}>{question.difficulty}</span><span className={`status ${question.reviewStatus === "APPROVED" ? "status-used" : question.reviewStatus === "REJECTED" ? "status-expired" : "status-pending"}`}>{question.reviewStatus ?? "DRAFT"}</span></div>
              <p>{question.text}</p><div className="bank-options">{question.options.map((option, index) => <span className={index === question.correctIndex ? "correct-option" : ""} key={index}>{String.fromCharCode(65 + index)}. {option}{index === question.correctIndex ? " ✓" : ""}</span>)}</div>
              {question.explanation && <small className="muted">Explanation: {question.explanation}</small>}
              <label className="question-review-source">Source (required before approval)<input aria-label={`Source for question ${question.id}`} value={(sourceDrafts[question.id] ?? question.source ?? "")} onChange={(event) => setSourceDrafts((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Add a real book, syllabus or reference source" /></label>
              <div className="row wrap"><button className="ghost" disabled={busy || !((sourceDrafts[question.id] ?? question.source ?? "")).trim() || ((sourceDrafts[question.id] ?? question.source ?? "")).trim().toUpperCase() === "NEEDS HUMAN REVIEW"} onClick={() => onReviewQuestion(question.id, "APPROVED", (sourceDrafts[question.id] ?? question.source ?? ""))}>Approve</button><button className="ghost" disabled={busy} onClick={() => onReviewQuestion(question.id, "REJECTED", (sourceDrafts[question.id] ?? question.source ?? ""))}>Reject</button><button className="text-button edit-question" onClick={() => onEditQuestion(question)}>Edit question</button></div>
            </div>
          </article>
        ))}
      </div>
      <div className="pagination"><button className="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Previous</button><span>Page {page} of {pageCount}</span><button className="ghost" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next →</button></div>
    </>
  );
}
