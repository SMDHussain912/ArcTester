import { useEffect, useRef, useState } from "react";
import {
  createServerClockAnchor,
  holdServerClock,
  remainingServerSeconds,
  resumeServerClock,
  type ServerClockAnchor,
} from "./assignedExamRuntime";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(new RegExp("/+$"), "");
const HEARTBEAT_INTERVAL_MS = 15_000;
const AUTOSAVE_INTERVAL_MS = 5_000;
const PAUSE_POLL_INTERVAL_MS = 5_000;
const MAX_AUTO_SUBMIT_RETRIES = 5;
const AUTO_SUBMIT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

type Assignment = {
  id: string;
  status: string;
  assignedAt: string;
  availableFrom: string | null;
  dueAt: string | null;
  exam: { id: string; title: string; description: string };
  version: number;
  durationMinutes: number;
  questionCount: number;
  submission: { id: string; status: string; score: number | null; maximumScore: number | null } | null;
};
type ExamPackage = {
  assignmentId: string;
  title: string;
  description: string;
  version: number;
  instructions: string;
  durationMinutes: number;
  serverTime: string;
  questions: {
    id: string;
    position: number;
    subject: string;
    topic: string | null;
    text: string;
    options: string[];
    optionOrder: number[];
    marks: number;
    negativeMarks: number;
  }[];
};
type ExamResult = {
  status: string;
  score: number;
  maximumScore: number;
  questions: {
    id: string;
    position: number;
    subject: string;
    topic: string | null;
    text: string;
    options: string[];
    correctIndex: number;
    selectedIndex: number | null;
    isCorrect: boolean;
    awardedMarks: number;
    marks: number;
    negativeMarks: number;
    explanation: string;
  }[];
};
type ServerSession = {
  id: string;
  status: string;
  startedAt: string;
  serverTime: string;
  deadline: string;
};
type SavedAnswer = { examQuestionId: string; selectedIndex: number | null };
type LocalExamBackup = {
  attemptUuid: string;
  startedAt: string;
  answers: Record<string, number>;
  savedAt: string;
};

function createUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.random() * 16 | 0;
    return (char === "x" ? value : (value & 3 | 8)).toString(16);
  });
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "HttpError"; }
}
function isNetworkError(error: unknown): boolean { return error instanceof TypeError; }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(typeof body.error === "string" ? body.error : response.statusText || "The request failed.", response.status);
  return body as T;
}

function backupKey(assignmentId: string): string {
  return "arctester:assigned-exam:" + assignmentId;
}

function readBackup(assignmentId: string): LocalExamBackup | null {
  try {
    const raw = localStorage.getItem(backupKey(assignmentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalExamBackup;
    if (!parsed.attemptUuid || !parsed.startedAt || !parsed.answers) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBackup(assignmentId: string, backup: LocalExamBackup): void {
  try {
    localStorage.setItem(backupKey(assignmentId), JSON.stringify(backup));
  } catch {
    // The server autosave remains authoritative when browser storage is unavailable.
  }
}

export default function AssignedExams() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [active, setActive] = useState<ExamPackage | null>(null);
  const [activeId, setActiveId] = useState("");
  const [session, setSession] = useState<ServerSession | null>(null);
  const [clockAnchor, setClockAnchor] = useState<ServerClockAnchor | null>(null);
  const [heldSeconds, setHeldSeconds] = useState<number | null>(null);
  const [attemptUuid, setAttemptUuid] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [paused, setPaused] = useState(false);
  const [syncState, setSyncState] = useState<"saved locally" | "synced" | "submitted">("saved locally");
  const [reconnecting, setReconnecting] = useState(false);
  const revision = useRef(0);
  const answersRef = useRef<Record<string, number>>({});
  const submitting = useRef(false);
  const clockAnchorRef = useRef<ServerClockAnchor | null>(null);
  const remainingRef = useRef(0);
  const autoSubmitStarted = useRef(false);

  function updateClockAnchor(anchor: ServerClockAnchor | null) {
    clockAnchorRef.current = anchor;
    setClockAnchor(anchor);
  }

  function updateRemaining(value: number) {
    remainingRef.current = value;
    setRemaining(value);
  }

  async function load() {
    try {
      const response = await request<{ assignments: Assignment[] }>("/exams/assigned");
      setItems(Array.isArray(response.assignments) ? response.assignments : []);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const onOnline = () => { setOffline(false); setReconnecting(true); };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!active || !activeId || !attemptUuid || !session) return;
    writeBackup(activeId, {
      attemptUuid,
      startedAt: session.startedAt,
      answers,
      savedAt: new Date().toISOString(),
    });
    answersRef.current = answers;
    setSyncState("saved locally");
  }, [active, activeId, attemptUuid, session, answers]);

  async function start(id: string) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const packageResponse = await request<{ package: ExamPackage }>(`/exams/assignments/${id}/package`);
      const sessionResponse = await request<{ session: ServerSession }>(
        `/exams/assignments/${id}/session/start`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const serverSession = sessionResponse.session;
      const backup = readBackup(id);
      const restored = await request<{ revision: number; answers: SavedAnswer[] }>(
        `/exams/assignments/${id}/answers`,
      );
      const restoredAnswers: Record<string, number> = {};
      for (const answer of restored.answers) {
        if (answer.selectedIndex !== null) {
          const question = packageResponse.package.questions.find((item) => item.id === answer.examQuestionId);
          const displayIndex = question?.optionOrder.indexOf(answer.selectedIndex) ?? -1;
          if (displayIndex >= 0) restoredAnswers[answer.examQuestionId] = displayIndex;
        }
      }
      const merged = { ...restoredAnswers, ...(backup?.answers ?? {}) };
      setActive(packageResponse.package);
      setActiveId(id);
      setSession(serverSession);
      updateClockAnchor(createServerClockAnchor(serverSession, performance.now()));
      setHeldSeconds(null);
      setPaused(false);
      setAttemptUuid(backup?.attemptUuid ?? createUuid());
      setAnswers(merged);
      answersRef.current = merged;
      revision.current = restored.revision;
      updateRemaining(remainingServerSeconds(createServerClockAnchor(serverSession, performance.now()), performance.now()));
      setSyncState("saved locally");
      setOffline(!navigator.onLine);
    } catch (caught) {
      if (isNetworkError(caught)) setOffline(true);
      else setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function syncAnswers() {
    if (!active || !activeId || !session || paused || offline || result) return;
    const payload = active.questions.map((question) => ({
      examQuestionId: question.id,
      selectedIndex: answersRef.current[question.id] === undefined
        ? null
        : question.optionOrder[answersRef.current[question.id]],
    }));
    try {
      const saved = await request<{ revision: number }>(`/exams/assignments/${activeId}/answers`, {
        method: "PUT",
        body: JSON.stringify({ revision: revision.current, answers: payload }),
      });
      revision.current = saved.revision;
      setSyncState("synced");
    } catch (caught) {
      if (isNetworkError(caught)) setOffline(true);
      else if (caught instanceof HttpError && caught.status === 409) {
        setPaused(true);
        setHeldSeconds(clockAnchorRef.current ? holdServerClock(clockAnchorRef.current, performance.now()) : remainingRef.current);
      } else setError((caught as Error).message);
    }
  }

  useEffect(() => {
    if (!active || !session || result || paused) return;
    const timer = window.setInterval(() => {
      if (clockAnchorRef.current) updateRemaining(remainingServerSeconds(clockAnchorRef.current, performance.now()));
    }, 250);
    return () => window.clearInterval(timer);
  }, [active, session, result, paused, clockAnchor]);

  useEffect(() => {
    if (!active || !session || result || paused) return;
    const timer = window.setInterval(() => { void syncAnswers(); }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, session, result, paused, offline, activeId]);

  useEffect(() => {
    if (!active || !session || result || paused) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await request<{ serverTime: string; deadline: string; sessionStatus: string }>(
          `/exams/assignments/${activeId}/session/heartbeat`,
          { method: "POST", body: JSON.stringify({ event: "HEARTBEAT" }) },
        );
        const anchor = resumeServerClock(
          Math.max(0, Math.ceil((Date.parse(response.deadline) - Date.parse(response.serverTime)) / 1000)),
          response.serverTime,
          performance.now(),
        );
        updateClockAnchor(anchor);
        updateRemaining(remainingServerSeconds(anchor, performance.now()));
        setOffline(false);
        setReconnecting(false);
      } catch (caught) {
              if (isNetworkError(caught)) setOffline(true);
              else if (caught instanceof HttpError && caught.status === 409) {
                setPaused(true);
                setHeldSeconds(clockAnchorRef.current ? holdServerClock(clockAnchorRef.current, performance.now()) : remainingRef.current);
              } else setError((caught as Error).message);
      }
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, session, result, paused, activeId]);

  useEffect(() => {
    if (!active || !session || !paused || result || offline) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await request<{ session: ServerSession }>("/exams/assignments/" + activeId + "/session/start", { method: "POST", body: JSON.stringify({}) });
        const anchor = createServerClockAnchor(response.session, performance.now());
        setSession(response.session); updateClockAnchor(anchor);
        updateRemaining(remainingServerSeconds(anchor, performance.now()));
        setPaused(false); setHeldSeconds(null); setOffline(false); setError(""); setReconnecting(false);
        await syncAnswers();
      } catch (caught) {
        if (isNetworkError(caught)) setOffline(true);
        else if (!(caught instanceof HttpError && caught.status === 409)) setError((caught as Error).message);
      }
    }, PAUSE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, session, paused, result, offline, activeId]);
  useEffect(() => {
    if (!active || !session || result || paused || remaining > 0 || busy || autoSubmitStarted.current) return;
    autoSubmitStarted.current = true;
    void submit(true);
  }, [active, session, result, paused, remaining, busy]);

  useEffect(() => {
    if (!active || !session || !reconnecting || result) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await request<{ session: ServerSession }>(
          `/exams/assignments/${activeId}/session/start`,
          { method: "POST", body: JSON.stringify({}) },
        );
        if (cancelled) return;
        setSession(response.session);
        const anchor = createServerClockAnchor(response.session, performance.now());
        updateClockAnchor(anchor);
        updateRemaining(remainingServerSeconds(anchor, performance.now()));
        setPaused(false);
        setOffline(false);
        setReconnecting(false);
        setError("");
        await syncAnswers();
      } catch (caught) {
        if (cancelled) return;
        if (isNetworkError(caught)) {
          setOffline(true);
          setError("Connection restored, but the exam session could not be resumed yet. Your local answers are retained.");
          setReconnecting(false);
        } else if (caught instanceof HttpError && caught.status === 409) {
          setPaused(true);
          setHeldSeconds(clockAnchorRef.current ? holdServerClock(clockAnchorRef.current, performance.now()) : remainingRef.current);
        } else {
          setError((caught as Error).message);
          setReconnecting(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [active, session, reconnecting, result, activeId]);

  async function submit(automatic = false) {
    if (!active || !session || !activeId || submitting.current || result) return;
    submitting.current = true; setBusy(true); setError("");
    const body = { attemptUuid, startedAt: session.startedAt, submittedAt: new Date().toISOString(), revision: revision.current,
      answers: active.questions.map((question) => ({ examQuestionId: question.id, selectedIndex: answersRef.current[question.id] === undefined ? null : question.optionOrder[answersRef.current[question.id]] })) };
    try {
      let submitted = false; const attempts = automatic ? MAX_AUTO_SUBMIT_RETRIES + 1 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try { await request("/exams/assignments/" + activeId + "/submission", { method: "POST", body: JSON.stringify(body) }); submitted = true; break; }
        catch (caught) { if (!isNetworkError(caught)) throw caught; setOffline(true); if (attempt === attempts - 1) throw caught; await new Promise((resolve) => window.setTimeout(resolve, AUTO_SUBMIT_BACKOFF_MS[attempt])); }
      }
      if (!submitted) throw new TypeError("Could not reach the server.");
      const response = await request<{ result: ExamResult }>("/exams/assignments/" + activeId + "/result");
      setResult({ ...response.result, questions: Array.isArray(response.result?.questions) ? response.result.questions : [] });
      setSyncState("submitted"); localStorage.removeItem(backupKey(activeId)); await load();
    } catch (caught) {
      if (isNetworkError(caught)) { setOffline(true); setError("Could not reach the server. Your answers are saved on this device. Press Retry submission when you are back online."); }
      else { const httpError = caught as HttpError; setError(httpError.message); if (httpError.status === 409 || httpError.status === 403) autoSubmitStarted.current = true; }
    } finally { setBusy(false); submitting.current = false; }
  }

  function chooseAnswer(questionId: string, index: number) {
    setAnswers((current) => ({ ...current, [questionId]: index }));
  }

  function close() {
    setActive(null);
    setResult(null);
    setActiveId("");
    setSession(null);
    autoSubmitStarted.current = false;
    updateClockAnchor(null);
    setAnswers({});
    answersRef.current = {};
    void load();
  }

  const clock = `${Math.floor(remaining / 60).toString().padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;

  return (
    <section className="assigned-exams-section">
      <div className="section-head">
        <div><p className="eyebrow">EXAMINER ASSIGNMENTS</p><h2>Assigned mock tests</h2></div>
        <button className="ghost" onClick={() => void load()}>Refresh</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {active ? (
        <div className="assigned-runner panel">
          {result ? (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">EXAM SUBMITTED</p><h2>{active.title}</h2></div>
                <button className="ghost" onClick={close}>Back to dashboard</button>
              </div>
              <div className="panel score-panel"><strong>{result.score} / {result.maximumScore}</strong><span className="muted">Final score · {result.status}</span></div>
              {result.questions.map((question, index) => (
                <article className="panel question-card" key={question.id}>
                  <p className="eyebrow">QUESTION {index + 1} · {question.subject}</p>
                  <h3>{question.text}</h3>
                  <p className={question.isCorrect ? "success" : "error"}>{question.isCorrect ? "Correct" : question.selectedIndex === null ? "Not answered" : "Incorrect"} · {question.awardedMarks} marks</p>
                  <p className="muted">{question.explanation}</p>
                </article>
              ))}
            </>
          ) : (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">TIMED EXAM · VERSION {active.version}</p><h2>{active.title}</h2><p className="muted">{active.questions.length} questions · {active.durationMinutes} minutes</p></div>
                <div className={remaining < 300 ? "exam-clock urgent" : "exam-clock"} aria-live="off">{clock}</div>
              </div>
              {paused && <p className="status status-used" role="status">Paused by invigilator · timer held at {Math.floor((heldSeconds ?? remaining) / 60).toString().padStart(2, "0")}:{((heldSeconds ?? remaining) % 60).toString().padStart(2, "0")}. Waiting for resume.</p>}
              {offline && <p className="status status-used" role="status">Offline · answers are saved locally and will sync after reconnect.</p>}
              {!offline && <p className="muted" role="status">{syncState === "synced" ? "Synced with server" : "Saved locally"}</p>}
              {active.questions.map((question, index) => (
                <article className="panel question-card" key={question.id}>
                  <p className="eyebrow">QUESTION {index + 1} · {question.subject}{question.topic ? " / " + question.topic : ""} · +{question.marks} / −{question.negativeMarks}</p>
                  <h3>{question.text}</h3>
                  <div className="options">
                    {question.options.map((option, optionIndex) => (
                      <button key={optionIndex} className={answers[question.id] === optionIndex ? "option selected" : "option"} onClick={() => chooseAnswer(question.id, optionIndex)} disabled={paused}>
                        <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
              <div className="exam-submit-bar">
                <span>{Object.keys(answers).length} / {active.questions.length} answered</span>
                <button className="primary" disabled={busy || paused} onClick={() => void submit(false)}>{busy ? "Submitting…" : offline ? "Retry submission" : "Submit exam"}</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="assigned-exam-list">
          {items.map((item) => (
            <article className="panel assigned-exam-card" key={item.id}>
              <div><p className="eyebrow">VERSION {item.version} · {item.questionCount} QUESTIONS</p><h3>{item.exam.title}</h3><p className="muted">{item.durationMinutes} minutes{item.dueAt ? " · Due " + new Date(item.dueAt).toLocaleString() : ""}</p></div>
              <div>{item.submission ? <span className="status status-used">Submitted · {item.submission.score ?? "—"}/{item.submission.maximumScore ?? "—"}</span> : <button className="primary" disabled={busy} onClick={() => void start(item.id)}>Start exam →</button>}</div>
            </article>
          ))}
          {!items.length && <div className="panel empty-state">No exams have been assigned to your account yet.</div>}
        </div>
      )}
    </section>
  );
}
