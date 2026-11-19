import { useState } from "react";
import type { ReactNode } from "react";
export type PracticeSessionTest = {
  attemptId: number; mode: string; deadline: string | null; serverNow?: string;
  questions: { id: number; subject: string; topic: string | null; text: string; options: string[] }[];
  warnings: string[];
};
type Props = { test: PracticeSessionTest; answers: Record<number, number>; remainingSeconds: number | null; busy: boolean; onLeave: () => void; onSelectAnswer: (questionId: number, selectedIndex: number) => void; onSubmit: () => void };
export default function StudentPracticeSession({ test, answers, remainingSeconds, busy, onLeave, onSelectAnswer, onSubmit }: Props) {
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const answeredCount = test.questions.filter((question) => answers[question.id] !== undefined).length;
  const currentQuestion = test.questions[activeQuestionIndex];
  const timer: ReactNode = remainingSeconds !== null ? <> · <strong className={remainingSeconds < 300 ? "timer-warning" : "exam-countdown"}>{Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:{(remainingSeconds % 60).toString().padStart(2, "0")} remaining</strong></> : null;

  function goToQuestion(index: number) {
    const nextIndex = Math.max(0, Math.min(index, test.questions.length - 1));
    setActiveQuestionIndex(nextIndex);
    const question = test.questions[nextIndex];
    if (question) document.getElementById(`practice-question-${question.id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  return (
    <section>
      <div className="page-heading"><div><p className="eyebrow">PRACTICE SESSION</p><h1>Stay focused.</h1><p className="muted">{test.questions.length} questions · {answeredCount} answered{timer}</p></div><button type="button" className="ghost" disabled={busy} onClick={onLeave}>Leave session</button></div>
      {test.warnings.map((warning) => <p className="notice" key={warning}>{warning}</p>)}
      <section className="panel exam-question-navigator" aria-label="Practice question navigator">
        <div className="exam-progress-heading"><strong>Question progress</strong><span>{answeredCount} / {test.questions.length} answered · {test.questions.length - answeredCount} remaining</span></div>
        <div className="exam-progress-track" role="progressbar" aria-label="Answered questions" aria-valuemin={0} aria-valuemax={test.questions.length} aria-valuenow={answeredCount}><span style={{ width: `${test.questions.length ? answeredCount / test.questions.length * 100 : 0}%` }} /></div>
        <div className="exam-palette">{test.questions.map((question, index) => {
          const answered = answers[question.id] !== undefined;
          return <button type="button" key={question.id} aria-label={`Go to question ${index + 1}${answered ? ", answered" : ", unanswered"}`} aria-current={activeQuestionIndex === index ? "step" : undefined} aria-pressed={activeQuestionIndex === index} className={`exam-palette-item${answered ? " answered" : ""}${activeQuestionIndex === index ? " active" : ""}`} onClick={() => goToQuestion(index)}>{index + 1}</button>;
        })}</div>
        {currentQuestion ? <div className="exam-question-controls">
          <span className="muted">Viewing question {activeQuestionIndex + 1} of {test.questions.length}</span>
          <div className="row">
            <button type="button" className="button button-secondary" disabled={activeQuestionIndex === 0} onClick={() => goToQuestion(activeQuestionIndex - 1)} aria-label="Previous question in navigator">Previous</button>
            <button type="button" className="button button-secondary" disabled={activeQuestionIndex >= test.questions.length - 1} onClick={() => goToQuestion(activeQuestionIndex + 1)} aria-label="Next question in navigator">Next question</button>
          </div>
        </div> : null}
      </section>
      <div className="question-list">{test.questions.map((question, index) => (
        <article id={`practice-question-${question.id}`} data-active={activeQuestionIndex === index ? "true" : undefined} className="panel question-card" key={question.id}>
          <p className="eyebrow">QUESTION {index + 1} · {question.subject}{question.topic ? ` · ${question.topic}` : ""}</p><h2>{question.text}</h2>
          <div className="options">{question.options.map((option, optionIndex) => <button type="button" key={optionIndex} aria-pressed={answers[question.id] === optionIndex} className={answers[question.id] === optionIndex ? "option selected" : "option"} onClick={() => onSelectAnswer(question.id, optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>
          <div className="row question-card-navigation">
            <button type="button" className="ghost" disabled={index === 0} onClick={() => goToQuestion(index - 1)}>Previous question</button>
            <button type="button" className="ghost" disabled={index === test.questions.length - 1} onClick={() => goToQuestion(index + 1)}>Next question</button>
          </div>
        </article>
      ))}</div>
      <button type="button" className="primary" disabled={busy || test.questions.length === 0} onClick={onSubmit}>{busy ? "Submitting…" : `Submit answers · ${answeredCount}/${test.questions.length}`}</button>
    </section>
  );
}
