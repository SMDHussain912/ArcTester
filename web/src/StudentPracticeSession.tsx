import type { ReactNode } from "react";
export type PracticeSessionTest = {
  attemptId: number; mode: string; deadline: string | null; serverNow?: string;
  questions: { id: number; subject: string; topic: string | null; text: string; options: string[] }[];
  warnings: string[];
};
type Props = { test: PracticeSessionTest; answers: Record<number, number>; remainingSeconds: number | null; busy: boolean; onLeave: () => void; onSelectAnswer: (questionId: number, selectedIndex: number) => void; onSubmit: () => void };
export default function StudentPracticeSession({ test, answers, remainingSeconds, busy, onLeave, onSelectAnswer, onSubmit }: Props) {
  const answeredCount = Object.keys(answers).length;
  const timer: ReactNode = remainingSeconds !== null ? <> · <strong className={remainingSeconds < 300 ? "timer-warning" : "exam-countdown"}>{Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:{(remainingSeconds % 60).toString().padStart(2, "0")} remaining</strong></> : null;
  return (
    <section>
      <div className="page-heading"><div><p className="eyebrow">PRACTICE SESSION</p><h1>Stay focused.</h1><p className="muted">{test.questions.length} questions · {answeredCount} answered{timer}</p></div><button className="ghost" onClick={onLeave}>Leave session</button></div>
      {test.warnings.map((warning) => <p className="notice" key={warning}>{warning}</p>)}
      <section className="panel exam-question-navigator" aria-label="Practice question navigator">
        <div className="exam-progress-heading"><strong>Question progress</strong><span>{answeredCount} / {test.questions.length} answered</span></div>
        <div className="exam-progress-track"><span style={{ width: `${test.questions.length ? answeredCount / test.questions.length * 100 : 0}%` }} /></div>
        <div className="exam-palette">{test.questions.map((question, index) => <button type="button" key={question.id} aria-label={`Go to question ${index + 1}${answers[question.id] !== undefined ? ", answered" : ", unanswered"}`} className={answers[question.id] !== undefined ? "exam-palette-item answered" : "exam-palette-item"} onClick={() => document.getElementById(`practice-question-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{index + 1}</button>)}</div>
      </section>
      <div className="question-list">{test.questions.map((question, index) => (
        <article id={`practice-question-${question.id}`} className="panel question-card" key={question.id}>
          <p className="eyebrow">QUESTION {index + 1} · {question.subject}</p><h2>{question.text}</h2>
          <div className="options">{question.options.map((option, optionIndex) => <button type="button" key={optionIndex} className={answers[question.id] === optionIndex ? "option selected" : "option"} onClick={() => onSelectAnswer(question.id, optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>
        </article>
      ))}</div>
      <button className="primary" disabled={busy} onClick={onSubmit}>{busy ? "Submitting…" : "Submit answers"}</button>
    </section>
  );
}
