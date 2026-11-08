"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError, type AssignedExamPackage } from "../../../lib/api";
import { RequireSession } from "../../../lib/session";

type SavedAttempt = {
  attemptUuid: string;
  startedAt: string;
  answers: Record<string, number | null>;
  marked?: string[];
};

function storageKey(id: string): string {
  return "arctester-assignment-" + id;
}

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}

function AssignedExamRunner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assignmentId = params.id;
  const [exam, setExam] = useState<AssignedExamPackage | null>(null);
  const [attempt, setAttempt] = useState<SavedAttempt | null>(null);
  const [index, setIndex] = useState(0);
  const [marked, setMarked] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const [serverDeadline, setServerDeadline] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const sessionStartedRef = useRef(false);

  useEffect(() => {
    api
      .assignedExamPackage(assignmentId)
      .then(({ package: examPackage }) => {
        setExam(examPackage);
        try {
          const raw = window.localStorage.getItem(storageKey(assignmentId));
          if (raw) {
            const saved = JSON.parse(raw) as SavedAttempt;
            if (saved.attemptUuid && saved.startedAt && saved.answers) {
              setAttempt(saved);
              setMarked(saved.marked ?? []);
            }
          }
        } catch {
          window.localStorage.removeItem(storageKey(assignmentId));
        }
      })
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : "Could not load this exam.");
      })
      .finally(() => setLoading(false));
  }, [assignmentId]);

  useEffect(() => {
    if (!attempt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);

  useEffect(() => {
    if (!attempt || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    api.startAssignedExamSession(assignmentId).then(({ session }) => {
      setServerDeadline(session.deadline);
      if (session.startedAt !== attempt.startedAt) {
        const restored = { ...attempt, startedAt: session.startedAt };
        setAttempt(restored);
        try { window.localStorage.setItem(storageKey(assignmentId), JSON.stringify(restored)); } catch { /* in-memory attempt remains usable */ }
      }
    }).catch((cause: unknown) => {
      sessionStartedRef.current = false;
      setError(cause instanceof ApiError ? cause.message : "Could not restore the server exam session.");
    });
  }, [attempt, assignmentId]);

  const deadline = useMemo(() => {
    if (!exam || !attempt) return null;
    const durationDeadline = new Date(attempt.startedAt).getTime() + exam.durationMinutes * 60_000;
    const dueDeadline = exam.dueAt ? new Date(exam.dueAt).getTime() : Number.POSITIVE_INFINITY;
    return Math.min(durationDeadline, dueDeadline);
  }, [exam, attempt, serverDeadline]);
  const remaining = deadline === null ? 0 : Math.max(0, deadline - now);

  const persist = useCallback(
    (next: SavedAttempt) => {
      setAttempt(next);
      try {
        window.localStorage.setItem(storageKey(assignmentId), JSON.stringify(next));
      } catch {
        setError("Browser storage is unavailable. Keep this tab open until you submit.");
      }
    },
    [assignmentId]
  );

  async function startExam() {
    if (!exam) return;
    setError(null);
    try {
      const { session } = await api.startAssignedExamSession(assignmentId);
      sessionStartedRef.current = true;
      setServerDeadline(session.deadline);
      const next: SavedAttempt = {
        attemptUuid: window.crypto.randomUUID(),
        startedAt: session.startedAt,
        answers: {},
        marked: [],
      };
      persist(next);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Could not start the exam session.");
    }
  }

  function choose(questionId: string, selectedIndex: number) {
    if (!attempt) return;
    persist({ ...attempt, answers: { ...attempt.answers, [questionId]: selectedIndex } });
  }

  function clearAnswer(questionId: string) {
    if (!attempt) return;
    persist({ ...attempt, answers: { ...attempt.answers, [questionId]: null } });
  }

  function toggleMarked(questionId: string) {
    if (!attempt) return;
    const nextMarked = marked.includes(questionId)
      ? marked.filter((id) => id !== questionId)
      : [...marked, questionId];
    setMarked(nextMarked);
    persist({ ...attempt, marked: nextMarked });
  }

  const submit = useCallback(async () => {
    if (!exam || !attempt || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitAssignedExam(assignmentId, {
        attemptUuid: attempt.attemptUuid,
        startedAt: attempt.startedAt,
        submittedAt: new Date().toISOString(),
        answers: exam.questions.map((question) => ({
          examQuestionId: question.id,
          selectedIndex: attempt.answers[question.id] ?? null,
        })),
      });
      window.localStorage.removeItem(storageKey(assignmentId));
      router.replace("/assignments/" + assignmentId + "/result");
    } catch (cause: unknown) {
      submittingRef.current = false;
      setSubmitting(false);
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Submission failed. Your answers are still saved in this browser."
      );
    }
  }, [exam, attempt, assignmentId, router]);

  useEffect(() => {
    if (!attempt || !sessionStartedRef.current) return;
    const heartbeat = () => {
      const event = document.visibilityState === "visible" ? "HEARTBEAT" : "FOCUS_LOST";
      void api.heartbeatAssignedExamSession(assignmentId, event).then((result) => {
        if (result.deadline) setServerDeadline(result.deadline);
      }).catch(() => {
        setError("Connection to the exam server was interrupted or the session is paused. Your answers remain saved locally; reconnect or contact the invigilator.");
      });
    };
    const interval = window.setInterval(heartbeat, 15000);
    const onVisibility = () => {
      void api.heartbeatAssignedExamSession(assignmentId, document.visibilityState === "visible" ? "FOCUS_RESTORED" : "FOCUS_LOST")
        .then((result) => { if (result.deadline) setServerDeadline(result.deadline); }).catch(() => undefined);
    };
    const onOnline = () => { void api.heartbeatAssignedExamSession(assignmentId, "CONNECTION_RESTORED")
      .then((result) => { if (result.deadline) setServerDeadline(result.deadline); }).catch(() => undefined); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [attempt, assignmentId]);

  useEffect(() => {
    if (attempt && deadline !== null && remaining === 0 && !submittingRef.current) {
      void submit();
    }
  }, [attempt, deadline, remaining, submit]);

  if (loading) return <p className="mute">Loading exam…</p>;
  if (error && !exam) {
    return (
      <>
        <h1>Exam unavailable</h1>
        <p className="error">{error}</p>
        <Link className="button button-secondary" href="/assignments">
          Back to my exams
        </Link>
      </>
    );
  }
  if (!exam) return null;

  if (!attempt) {
    const availableAt = exam.availableFrom ? new Date(exam.availableFrom).getTime() : 0;
    const notYetAvailable = availableAt > Date.now();
    return (
      <section className="panel">
        <p className="eyebrow">Assigned exam · Version {exam.version}</p>
        <h1>{exam.title}</h1>
        {exam.description ? <p className="muted">{exam.description}</p> : null}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Questions</div>
            <div className="stat-value">{exam.questions.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Duration</div>
            <div className="stat-value">{exam.durationMinutes} min</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total marks</div>
            <div className="stat-value">
              {exam.questions.reduce((sum, question) => sum + question.marks, 0)}
            </div>
          </div>
        </div>
        <h2 style={{ marginTop: 24 }}>Instructions</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>
          {exam.instructions ||
            "Read each question carefully and select one answer. You can move between questions before submitting."}
        </p>
        {notYetAvailable ? (
          <p className="warn">
            This exam opens at {new Date(exam.availableFrom!).toLocaleString()}. You can download
            the exam now, but you cannot start it yet.
          </p>
        ) : (
          <p className="warn">
            The timer starts when you begin. Your answers are saved in this browser while the exam
            is open. Do not clear browser storage or close this browser before submitting.
          </p>
        )}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link className="button button-secondary" href="/assignments">
            Cancel
          </Link>
          <button className="button button-primary" onClick={startExam} disabled={notYetAvailable}>
            Start exam →
          </button>
        </div>
      </section>
    );
  }

  const question = exam.questions[index];
  const answered = exam.questions.filter(
    (item) => attempt.answers[item.id] !== undefined && attempt.answers[item.id] !== null
  ).length;

  return (
    <div className="exam-layout">
      <div className="exam-heading">
        <div>
          <p className="eyebrow">Assigned exam</p>
          <h1>{exam.title}</h1>
          <p className="muted">
            Question {index + 1} of {exam.questions.length} · {answered} answered
          </p>
        </div>
        <div
          className={"exam-clock" + (remaining < 5 * 60_000 ? " low" : "")}
          role="timer"
          aria-live="polite"
        >
          <span className="mute">Time remaining</span>
          <strong>{formatTime(remaining)}</strong>
        </div>
      </div>
      <div className="exam-progress">
        <div>
          <span style={{ width: ((index + 1) / exam.questions.length) * 100 + "%" }} />
        </div>
        <span className="mute">{Math.round(((index + 1) / exam.questions.length) * 100)}%</span>
      </div>
      {remaining <= 60_000 ? <p className="error" role="alert">One minute remaining. Review your answers and submit immediately.</p>
        : remaining <= 5 * 60_000 ? <p className="warn" role="status">Five minutes remaining. Finish your review and prepare to submit.</p>
        : remaining <= 15 * 60_000 ? <p className="warn" role="status">Fifteen minutes remaining.</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="exam-content">
        <section className="panel exam-question-panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="pill pill-accent">
              {question.subject}
              {question.topic ? " · " + question.topic : ""}
            </span>
            <span className="pill">
              {question.marks} marks
              {question.negativeMarks ? " · -" + question.negativeMarks + " wrong" : ""}
            </span>
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <span className="mute">{marked.length} questions marked for review</span>
            <button type="button" className="button button-quiet button-small" onClick={() => toggleMarked(question.id)}>
              {marked.includes(question.id) ? "Remove review mark" : "Mark for review"}
            </button>
          </div>
          <fieldset className="exam-options" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="exam-question-text">{question.text}</legend>
            {question.options.map((option, optionIndex) => (
              <label
                key={optionIndex}
                className={attempt.answers[question.id] === optionIndex ? "sel" : ""}
              >
                <input
                  type="radio"
                  name={"q-" + question.id}
                  checked={attempt.answers[question.id] === optionIndex}
                  onChange={() => choose(question.id, optionIndex)}
                />
                <span className="exam-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                <span>{option}</span>
              </label>
            ))}
          </fieldset>
          <div className="exam-controls">
            <button
              className="button button-secondary"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
            >
              ← Previous
            </button>
            <button className="button button-quiet" onClick={() => clearAnswer(question.id)} disabled={attempt.answers[question.id] === undefined || attempt.answers[question.id] === null}>Clear answer</button>
            <button
              className="button button-primary"
              onClick={() => setIndex((value) => Math.min(exam.questions.length - 1, value + 1))}
              disabled={index === exam.questions.length - 1}
            >
              Next →
            </button>
          </div>
        </section>
        <aside className="panel exam-sidebar">
          <div className="panel-header">
            <h2>Questions</h2>
            <span className="pill">
              {answered}/{exam.questions.length}
            </span>
          </div>
          <div className="pal" role="group" aria-label="Question palette">
            {exam.questions.map((item, questionIndex) => (
              <button
                key={item.id}
                className={
                  (attempt.answers[item.id] !== undefined && attempt.answers[item.id] !== null
                    ? "answered "
                    : "") + (questionIndex === index ? "current" : "")
                }
                onClick={() => setIndex(questionIndex)}
                aria-label={"Question " + (questionIndex + 1)}
                aria-current={questionIndex === index}
              >
                {questionIndex + 1}
              </button>
            ))}
          </div>
          <div className="exam-submit">
            <p className="mute">
              {exam.questions.length - answered} unanswered. You may submit before the timer ends.
            </p>
            <button
              className="button button-primary"
              onClick={() => {
                if (window.confirm("Submit this exam now? You cannot change answers afterwards."))
                  void submit();
              }}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Submit exam"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function AssignedExamPage() {
  return (
    <RequireSession>
      <AssignedExamRunner />
    </RequireSession>
  );
}
