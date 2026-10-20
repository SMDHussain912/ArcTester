"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError, type AttemptView, type PublicQuestion } from "../../../lib/api";
import { fromSaved, toSubmitPayload } from "../../../lib/answers";
import { paletteCounts, paletteStatuses } from "../../../lib/palette";
import { formatMs, remainingMs } from "../../../lib/timer";

const STORAGE_PREFIX = "ecet-attempt-";

function storageKey(attemptId: number): string {
  return `${STORAGE_PREFIX}${attemptId}`;
}

/** Answers live in sessionStorage so a refresh restores the paper. */
function loadAnswers(attemptId: number): Record<number, number | null> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(attemptId));
    return raw ? (JSON.parse(raw) as Record<number, number | null>) : null;
  } catch {
    return null;
  }
}

function saveAnswers(attemptId: number, answers: Record<number, number | null>): void {
  try {
    window.sessionStorage.setItem(storageKey(attemptId), JSON.stringify(answers));
  } catch {
    // Storage full/blocked: the test still works, it just cannot restore.
  }
}

function clearStorage(attemptId: number): void {
  try {
    window.sessionStorage.removeItem(storageKey(attemptId));
  } catch {
    // Ignore.
  }
}

export default function TestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const attemptId = Number(params.id);

  const [view, setView] = useState<AttemptView | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [index, setIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const loadedAtRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Load the attempt (restore-on-refresh: server is the source of truth).
  useEffect(() => {
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      setError("That test link is not valid.");
      return;
    }
    api
      .getAttempt(attemptId)
      .then((data) => {
        setView(data);
        setQuestions(data.questions);
        loadedAtRef.current = Date.now();
        setElapsedMs(0);
        const restored = loadAnswers(attemptId) ?? fromSaved(data.saved);
        setAnswers(restored);
        saveAnswers(attemptId, restored);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 409) {
          router.replace(`/result/${attemptId}`);
          return;
        }
        setError(e instanceof ApiError ? e.message : "Could not load the test.");
      });
  }, [attemptId, router]);

  // Tick the clock every second. We only trust elapsed DELTAS, not the
  // absolute local clock, so a wrong system time cannot extend a paper.
  useEffect(() => {
    if (!view || loadedAtRef.current === null) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - (loadedAtRef.current ?? Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [view]);

  const timer = useMemo(() => {
    if (!view) return { remainingMs: 0, expired: false };
    return remainingMs({ deadline: view.deadline, serverNow: view.serverNow, elapsedMs });
  }, [view, elapsedMs]);

  const submit = useCallback(async () => {
    if (!view || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await api.submit(
        attemptId,
        toSubmitPayload(
          answers,
          questions.map((q) => q.id)
        ).answers
      );
      clearStorage(attemptId);
      router.replace(`/result/${attemptId}`);
    } catch (e: unknown) {
      submittedRef.current = false;
      setSubmitting(false);
      setError(e instanceof ApiError ? e.message : "Could not submit the test.");
    }
  }, [view, attemptId, answers, questions, router]);

  // Auto-submit at the deadline.
  useEffect(() => {
    if (view && timer.expired && !submittedRef.current) {
      void submit();
    }
  }, [view, timer.expired, submit]);

  // Warn before leaving the page with an unfinished test.
  useEffect(() => {
    if (!view) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (!submittedRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [view]);

  function choose(questionId: number, optionIndex: number) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: optionIndex };
      saveAnswers(attemptId, next);
      return next;
    });
  }

  function clearAnswer(questionId: number) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: null };
      saveAnswers(attemptId, next);
      return next;
    });
  }

  function toggleMark(questionId: number) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function confirmSubmit() {
    if (window.confirm("Submit the test now?")) void submit();
  }

  if (error) {
    return (
      <>
        <h1>Test</h1>
        <p className="error">{error}</p>
        <button className="alt" onClick={() => router.push("/")}>
          Back to home
        </button>
      </>
    );
  }

  if (!view || questions.length === 0) {
    return <p className="mute">Loading your test…</p>;
  }

  const question = questions[index];
  const answerList = questions.map((q) => answers[q.id] ?? null);
  const statuses = paletteStatuses(answerList, marked, index);
  const counts = paletteCounts(answerList, marked);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span
          className={`timer${timer.remainingMs < 5 * 60 * 1000 ? " low" : ""}`}
          role="timer"
          aria-live="polite"
        >
          {formatMs(timer.remainingMs)}
        </span>
        <span className="mute">
          {index + 1} of {questions.length} · {question.subject}
        </span>
      </div>

      <div className="card">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>
            <b>
              {index + 1}. {question.text}
            </b>
          </legend>
          {question.options.map((option, optionIndex) => (
            <label key={optionIndex} className={answers[question.id] === optionIndex ? "sel" : ""}>
              <input
                type="radio"
                name={`q-${question.id}`}
                checked={answers[question.id] === optionIndex}
                onChange={() => choose(question.id, optionIndex)}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>

        <button
          className="alt"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          Previous
        </button>
        <button
          onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
          disabled={index === questions.length - 1}
        >
          Next
        </button>
        <button className="alt" onClick={() => clearAnswer(question.id)}>
          Clear answer
        </button>
        <button
          className="alt"
          onClick={() => toggleMark(question.id)}
          aria-pressed={marked.has(question.id)}
        >
          {marked.has(question.id) ? "Unmark review" : "Mark for review"}
        </button>
      </div>

      <div className="card">
        <p className="mute">
          {counts.answered} answered · {counts.unanswered} unanswered · {counts.marked} marked
        </p>
        <div className="pal" role="group" aria-label="Question palette">
          {statuses.map((status, i) => (
            <button
              key={i}
              className={status}
              onClick={() => setIndex(i)}
              aria-label={`Question ${i + 1}, ${status}`}
              aria-current={i === index}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <p>
        <button onClick={confirmSubmit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit test"}
        </button>
      </p>
    </>
  );
}
