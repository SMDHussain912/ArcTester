import type { FormEvent } from "react";
import { canonicalPaperSubject } from "./apEcet2026";

export type AdminPaperDraft = { title: string; description: string; instructions: string; duration: string; shuffleQuestions: boolean; shuffleOptions: boolean; marks: string; negative: string; selectionMode: "manual" | "random"; perSubject: string };
export type AdminPaperCatalogSubject = { id: number; name: string; count: number; topics: { id: number; name: string; _count: { questions: number } }[] };
export type AdminPaperQuestion = { id: number; subject: string; topic: string; text: string; options: string[]; correctIndex: number; explanation: string; source: string; difficulty: string };
export type AdminPaperDifficultyMix = { easy: number; medium: number; hard: number };
export type AdminPaperSubjectScoring = Record<string, { marks: number; negativeMarks: number }>;
type Difficulty = keyof AdminPaperDifficultyMix;
type AdminPaperBuilderProps = {
  exam: AdminPaperDraft;
  examIds: number[];
  catalog: AdminPaperCatalogSubject[];
  questions: AdminPaperQuestion[];
  page: number;
  subject: string;
  difficulty: string;
  subjectQuotas: Record<string, number>;
  difficultyMix: AdminPaperDifficultyMix;
  subjectScoring: AdminPaperSubjectScoring;
  busy: boolean;
  onExamChange: (field: keyof AdminPaperDraft, value: string | boolean) => void;
  onLoadPreset: () => void;
  onSelectionModeChange: (value: "manual" | "random") => void;
  onSubjectQuotaChange: (name: string, value: number) => void;
  onDifficultyMixChange: (level: Difficulty, value: number) => void;
  onSubjectChange: (value: string) => void;
  onDifficultyChange: (value: string) => void;
  onSelectVisible: () => void;
  onToggleQuestion: (id: number) => void;
  onPageChange: (page: number) => void;
  onSubjectScoringChange: (name: string, rule: { marks: number; negativeMarks: number }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function AdminPaperBuilder({ exam, examIds, catalog, questions, page, subject, difficulty, subjectQuotas, difficultyMix, subjectScoring, busy, onExamChange, onLoadPreset, onSelectionModeChange, onSubjectQuotaChange, onDifficultyMixChange, onSubjectChange, onDifficultyChange, onSelectVisible, onToggleQuestion, onPageChange, onSubjectScoringChange, onSubmit }: AdminPaperBuilderProps) {
  const update = (field: keyof AdminPaperDraft, value: string | boolean) => onExamChange(field, value);
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">PAPER SETTING STUDIO</p><h1>Mock test builder</h1><p>Set the rules first, then select questions or let ArcTester draw a balanced paper from your bank.</p></div></div>
      <form onSubmit={onSubmit} className="builder-grid">
        <section className="admin-panel builder-main">
          <div className="preset-bar"><span><b>Quick preset</b><small>Load the official AP ECET 2026 CSE subject distribution (200 questions).</small></span><button type="button" className="ghost" onClick={onLoadPreset}>Load AP ECET CSE preset</button></div>
          <div className="admin-panel-head"><div><p className="eyebrow">01 · PAPER DETAILS</p><h2>Exam identity</h2></div></div>
          <label>Test title<input required minLength={2} value={exam.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. AP ECET CSE — Full Mock 01" /></label>
          <label>Description<textarea value={exam.description} onChange={(event) => update("description", event.target.value)} placeholder="What this paper covers…" /></label>
          <label>Instructions<textarea value={exam.instructions} onChange={(event) => update("instructions", event.target.value)} /></label>
          <div className="builder-fields"><label>Duration (minutes)<input type="number" min="1" max="600" value={exam.duration} onChange={(event) => update("duration", event.target.value)} /></label><label>Marks per question<input type="number" step="0.25" min="0" value={exam.marks} onChange={(event) => update("marks", event.target.value)} /></label><label>Negative marks<input type="number" step="0.25" min="0" value={exam.negative} onChange={(event) => update("negative", event.target.value)} /></label></div>
          <div className="builder-switches"><label><input type="checkbox" checked={exam.shuffleQuestions} onChange={(event) => update("shuffleQuestions", event.target.checked)} /> Shuffle question order</label><label><input type="checkbox" checked={exam.shuffleOptions} onChange={(event) => update("shuffleOptions", event.target.checked)} /> Shuffle answer options</label></div>
          <div className="admin-panel-head"><div><p className="eyebrow">02 · QUESTION SELECTION</p><h2>Build the paper</h2></div></div>
          <div className="segmented"><button type="button" className={exam.selectionMode === "manual" ? "chosen" : ""} onClick={() => onSelectionModeChange("manual")}>Manual selection</button><button type="button" className={exam.selectionMode === "random" ? "chosen" : ""} onClick={() => onSelectionModeChange("random")}>Automatic draw</button></div>
          {exam.selectionMode === "random" ? <><label>Default questions per subject<input type="number" min="1" max="100" value={exam.perSubject} onChange={(event) => update("perSubject", event.target.value)} placeholder="e.g. 20" /></label><div className="quota-list"><b>Subject-wise question quotas</b>{catalog.map((item) => <label key={item.id}><span>{item.name}<small>{item.count} available</small></span><input type="number" min="0" max="500" value={subjectQuotas[canonicalPaperSubject(item.name)] ?? subjectQuotas[item.name] ?? ""} placeholder={String(Number(exam.perSubject) || 10)} onChange={(event) => onSubjectQuotaChange(item.name, Number(event.target.value))} /></label>)}</div><div className="difficulty-mix"><b>Difficulty balance (%)</b>{(["easy", "medium", "hard"] as const).map((level) => <label key={level}>{level}<input type="number" min="0" max="100" value={difficultyMix[level]} onChange={(event) => onDifficultyMixChange(level, Number(event.target.value))} /></label>)}</div><p className="muted">Questions are drawn from the complete bank. The generator targets your difficulty split and fills any shortage from the remaining questions. Subject quotas of zero exclude that subject.</p></> : <><div className="builder-filter"><select value={subject} onChange={(event) => onSubjectChange(event.target.value)}><option value="">All subjects</option>{catalog.map((item) => <option key={item.id}>{item.name}</option>)}</select><select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)}><option value="">All difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select><button type="button" className="ghost" onClick={onSelectVisible}>Select visible</button></div><div className="builder-question-list">{questions.map((question) => <label key={question.id}><input type="checkbox" checked={examIds.includes(question.id)} onChange={() => onToggleQuestion(question.id)} /><span><b>{question.subject} · {question.topic}</b><small>{question.text}</small></span><em>{question.difficulty}</em></label>)}</div><div className="pagination"><button type="button" className="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><span>{examIds.length} selected · page {page}</span><button type="button" className="ghost" onClick={() => onPageChange(page + 1)}>Next</button></div></>}
          <div className="subject-scoring"><b>Subject-wise scoring rules</b><p className="muted">Override marks and negative marking for individual subjects. Empty subjects use the global defaults.</p>{catalog.map((item) => { const rule = subjectScoring[item.name] ?? { marks: Number(exam.marks) || 1, negativeMarks: Number(exam.negative) || 0 }; return <div className="subject-score-row" key={item.id}><span>{item.name}</span><label>Marks<input type="number" min="0" max="100" step="0.25" value={subjectScoring[item.name]?.marks ?? ""} placeholder={String(exam.marks)} onChange={(event) => onSubjectScoringChange(item.name, { ...rule, marks: Number(event.target.value) })} /></label><label>Negative<input type="number" min="0" max="100" step="0.25" value={subjectScoring[item.name]?.negativeMarks ?? ""} placeholder={String(exam.negative)} onChange={(event) => onSubjectScoringChange(item.name, { ...rule, negativeMarks: Number(event.target.value) })} /></label></div>; })}</div>
        </section>
        <aside className="admin-panel builder-summary"><p className="eyebrow">PAPER SUMMARY</p><h2>Exam settings</h2><div className="summary-stat"><b>{exam.selectionMode === "manual" ? examIds.length : "Auto"}</b><span>Questions selected</span></div><div className="summary-stat"><b>{exam.duration} min</b><span>Time limit</span></div><div className="summary-stat"><b>{(Number(exam.marks) || 0) * (exam.selectionMode === "manual" ? examIds.length : 0)}</b><span>Maximum marks (manual selection)</span></div><button className="primary full" disabled={busy || !exam.title.trim() || (exam.selectionMode === "manual" && !examIds.length)} type="submit">Save draft exam →</button><p className="muted">Publishing creates an immutable version. You can assign it to students after review.</p></aside>
      </form>
    </>
  );
}
