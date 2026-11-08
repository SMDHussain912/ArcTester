"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, isAuthError, type BankInfo } from "../../lib/api";
import { RequireSession, useSession } from "../../lib/session";

type PaperMode = "mock" | "practice" | "mistakes";
type Stage = "select" | "instructions";

function PracticePaperChooser() {
  const router = useRouter();
  const { refresh, user } = useSession();
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [mode, setMode] = useState<PaperMode>("mock");
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(20);
  const [stage, setStage] = useState<Stage>("select");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.bank().then((value) => {
      setBank(value);
      setSubject(value.subjects[0]?.subject ?? "");
    }).catch((cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : "Could not load available practice subjects.");
    });
  }, []);

  const selectedSubject = bank?.subjects.find((item) => item.subject === subject);
  const questionCount = mode === "mock" ? 200 : Math.min(count, selectedSubject?.count ?? count);
  const durationMinutes = mode === "mock" ? 180 : Math.max(5, Math.ceil(questionCount * 1.5));

  async function startExam() {
    setStarting(true);
    setError("");
    try {
      const body: { mode: PaperMode; subject?: string; count?: number } = { mode };
      if (mode !== "mock") {
        body.subject = subject;
        body.count = count;
      }
      const created = await api.createTest(body);
      router.push("/test/" + created.attemptId);
    } catch (cause: unknown) {
      if (isAuthError(cause)) {
        await refresh();
        setError("Your session expired. Sign in again before starting.");
      } else {
        setError(cause instanceof ApiError ? cause.message : "Could not prepare this paper.");
      }
      setStarting(false);
    }
  }

  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">Practice centre</p>
        <h1>Choose your question paper</h1>
        <p className="muted">Select a practice format first. Review its details and exam instructions before the timer begins.</p>
      </section>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {stage === "select" ? (
        <div className="stack">
          <div className="action-grid">
            <button type="button" className={mode === "mock" ? "action-card sel" : "action-card"} onClick={() => setMode("mock")}>
              <span className="eyebrow">Exam simulation</span>
              <h2>Full AP ECET CSE Mock</h2>
              <p className="muted">A complete timed practice session following the current 200-question, 180-minute pattern.</p>
              <strong>200 questions · 180 minutes</strong>
            </button>
            <button type="button" className={mode === "practice" ? "action-card sel" : "action-card"} onClick={() => setMode("practice")}>
              <span className="eyebrow">Focused learning</span>
              <h2>Subject Practice</h2>
              <p className="muted">Build a focused paper from one subject and choose how many questions to attempt.</p>
              <strong>Choose subject and question count</strong>
            </button>
            <button type="button" className={mode === "mistakes" ? "action-card sel" : "action-card"} onClick={() => setMode("mistakes")}>
              <span className="eyebrow">Revision</span>
              <h2>Revise Mistakes</h2>
              <p className="muted">Revisit questions you previously answered incorrectly.</p>
              <strong>Personal revision paper</strong>
            </button>
          </div>

          {mode !== "mock" ? (
            <section className="panel">
              <h2>Configure your paper</h2>
              <label style={{ display: "block" }}>Subject
                <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                  {(bank?.subjects ?? []).map((item) => <option key={item.subject} value={item.subject}>{item.subject} ({item.count} available)</option>)}
                </select>
              </label>
              <label style={{ display: "block" }}>Number of questions
                <input type="number" min={1} max={200} value={count} onChange={(event) => setCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} />
              </label>
              <p className="mute">{selectedSubject ? selectedSubject.count + " questions are available in this subject." : "Loading question availability…"}</p>
            </section>
          ) : null}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <Link className="button button-secondary" href="/">Back to dashboard</Link>
            <button className="button button-primary" disabled={!bank || (mode !== "mock" && (!subject || !selectedSubject || selectedSubject.count === 0))} onClick={() => setStage("instructions")}>Review paper details →</button>
          </div>
        </div>
      ) : (
        <section className="panel stack">
          <p className="eyebrow">Pre-exam verification</p>
          <h1>Confirm your paper</h1>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-label">Paper type</div><div className="stat-value" style={{ fontSize: 18 }}>{mode === "mock" ? "Full mock" : mode === "practice" ? "Subject practice" : "Mistake revision"}</div></div>
            <div className="stat-card"><div className="stat-label">Questions requested</div><div className="stat-value">{questionCount}</div></div>
            <div className="stat-card"><div className="stat-label">Estimated duration</div><div className="stat-value">{durationMinutes} min</div></div>
            <div className="stat-card"><div className="stat-label">Subject</div><div className="stat-value" style={{ fontSize: 18 }}>{mode === "mock" ? "All subjects" : subject}</div></div>
          </div>
          <h2>Instructions for candidates</h2>
          <ol>
            <li>Read each question carefully and select one answer.</li>
            <li>Use the question palette to move between questions.</li>
            <li>Review unanswered questions before submitting.</li>
            <li>Do not refresh or close the exam tab while the paper is in progress.</li>
            <li>The countdown begins after you start. The test is submitted when time expires.</li>
          </ol>
          <p className="warn">Starting the paper creates an attempt. Once the timer begins, manage your time carefully.</p>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="button button-secondary" onClick={() => setStage("select")} disabled={starting}>Back to paper selection</button>
            <button className="button button-primary" onClick={() => void startExam()} disabled={starting}>{starting ? "Preparing paper…" : "I understand — Start exam"}</button>
          </div>
        </section>
      )}
    </>
  );
}

export default function PracticePage() {
  const { user } = useSession();
  if (user?.role === "ADMIN") {
    return <section className="panel"><h1>Practice is for student accounts</h1><Link className="button button-secondary" href="/admin">Open admin workspace</Link></section>;
  }
  return <RequireSession><PracticePaperChooser /></RequireSession>;
}
