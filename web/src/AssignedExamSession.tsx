import type { AssignedExamPackage } from "./types/assignedExams";
import { useExamIntegrity } from "./useExamIntegrity";
import IntegrityOverlay from "./IntegrityOverlay";
import ExamWatermark from "./ExamWatermark";

export interface AssignedExamSessionProps {
  package: AssignedExamPackage | null;
  answers: Record<string, number>;
  saveStatus: "idle" | "saving" | "saved" | "error";
  paused: boolean;
  remainingSeconds: number;
  busy: boolean;
  error: string | null;
  selectAssignedAnswer: (questionId: string, selectedIndex: number) => void;
  submitAssignedExam: (force?: boolean) => Promise<void>;
  studentName?: string | null;
  studentId?: string | null;
}

export default function AssignedExamSession({ package: activePackage, answers, saveStatus, paused, remainingSeconds, busy, error, selectAssignedAnswer, submitAssignedExam, studentName, studentId }: AssignedExamSessionProps) {
  if (!activePackage) return null;

  const integrityLevel = (activePackage.integrityLevel === "OFF" || activePackage.integrityLevel === "BASIC" || activePackage.integrityLevel === "STRICT")
    ? activePackage.integrityLevel
    : "OFF";
  const integrity = useExamIntegrity({
    assignmentId: activePackage.assignmentId,
    integrityLevel,
  });

  const clock = `${Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:${(remainingSeconds % 60).toString().padStart(2, "0")}`;

  return (
    <section className="assigned-exam-session">
      {integrity.flagged || integrity.warn ? (
        <IntegrityOverlay
          visible={integrity.flagged || integrity.warn}
          onReturnToFullscreen={() => void integrity.requestFullscreen()}
          violationCount={integrity.violationCount}
          maxViolations={integrity.maxViolations}
          warn={integrity.warn}
          flagged={integrity.flagged}
        />
      ) : null}
      <ExamWatermark studentName={studentName} studentId={studentId} enabled={integrityLevel !== "OFF"} />
      <div className="page-heading">
        <div>
          <p className="eyebrow">OFFICIAL ASSIGNED EXAM · VERSION {activePackage.version}</p>
          <h1>{activePackage.title}</h1>
          <p className="muted">{activePackage.questions.length} questions · {activePackage.durationMinutes} minutes · <strong className={paused || remainingSeconds < 300 ? "timer-warning" : "exam-countdown"}>{clock} remaining</strong></p>
        </div>
        <button className="ghost" disabled={busy} onClick={() => { if (window.confirm("Leave this exam? Your answers are saved on this device and synced to the server while online. You can reopen the exam and continue while time remains.")) { /* handled by parent */ } }}>Leave exam</button>
      </div>
      {paused && <p className="notice session-paused" role="status">Session paused or awaiting invigilator action. The server-controlled timer is held.</p>}
      {activePackage.instructions && <div className="panel exam-instructions"><strong>Instructions</strong><p>{activePackage.instructions}</p></div>}
      {activePackage.dueAt && <p className="notice">Submission deadline: {new Date(activePackage.dueAt).toLocaleString()}</p>}
      <section className="panel exam-question-navigator" aria-label="Question navigator">
        <div className="exam-progress-heading"><strong>Question progress</strong><span>{Object.keys(answers).length} / {activePackage.questions.length} answered</span></div>
        <div className="exam-progress-track"><span style={{ width: `${activePackage.questions.length ? Object.keys(answers).length / activePackage.questions.length * 100 : 0}%` }} /></div>
        <div className="exam-palette">{activePackage.questions.map((question, index) => <button type="button" key={question.id} disabled={paused} aria-label={`Go to question ${index + 1}${answers[question.id] !== undefined ? ", answered" : ", unanswered"}`} className={answers[question.id] !== undefined ? "exam-palette-item answered" : "exam-palette-item"} onClick={() => document.getElementById(`assigned-question-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{index + 1}</button>)}</div>
      </section>
      <div className="assigned-exam-question-list">{activePackage.questions.map((question, index) => <article id={`assigned-question-${question.id}`} className="panel question-card" key={question.id}><p className="eyebrow">QUESTION {index + 1} · {question.subject}{question.topic ? ` · ${question.topic}` : ""}</p><h2>{question.text}</h2><div className="options">{question.options.map((option, optionIndex) => <button type="button" key={optionIndex} disabled={paused} className={answers[question.id] === optionIndex ? "option selected" : "option"} onClick={() => selectAssignedAnswer(question.id, optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div><small className="muted">+{question.marks} marks · −{question.negativeMarks} for a wrong answer</small></article>)}</div>
      <div className="assigned-exam-submit"><span className="muted">{Object.keys(answers).length} of {activePackage.questions.length} answered</span><small className={`autosave-status autosave-${saveStatus}`}>{saveStatus === "saving" ? "Saving to server…" : saveStatus === "saved" ? "All answers synced" : saveStatus === "error" ? "Sync failed · local backup saved" : "Local backup active"}</small><button className="primary" disabled={busy || paused} onClick={() => void submitAssignedExam()}>{paused ? "Waiting for invigilator" : busy ? "Submitting…" : "Submit final answers"}</button></div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}