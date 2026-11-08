"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, isAuthError, type BankInfo } from "../lib/api";
import { RequireSession, useSession } from "../lib/session";

type Mode = "mock" | "practice" | "mistakes";

// prettier-ignore
export default function HomePage() {
  const router = useRouter();
  const { status, user, refresh } = useSession();
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("mock");
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(20);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.bank().then((info) => {
      setBank(info);
      setSubject((current) => current || info.subjects[0]?.subject || "");
    }).catch((e: unknown) => {
      setError(e instanceof ApiError ? e.message : "Could not load the question bank.");
    });
  }, []);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const body: { mode: Mode; subject?: string; count?: number } = { mode };
      if (mode !== "mock") {
        body.subject = subject;
        body.count = count;
      }
      const created = await api.createTest(body);
      router.push(`/test/${created.attemptId}`);
    } catch (e: unknown) {
      if (isAuthError(e)) {
        await refresh();
        setError("Your session expired. Please sign in again to start a test.");
      } else {
        setError(e instanceof ApiError ? e.message : "Could not start the test.");
      }
      setStarting(false);
    }
  }

  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">Your study workspace</p>
        <h1>Make every practice session count.</h1>
        <p className="muted">
          Prepare with timed mock tests, focused practice and question review — all in one place.
        </p>
      </section>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <div className="dashboard-grid">
        <div className="stack">
          <section className="panel hero-panel">
            <div className="panel-header">
              <span className="pill pill-accent">Study dashboard</span>
              {status === "authenticated" && user ? <span className="pill">{user.email}</span> : null}
            </div>
            <h1>{status === "authenticated" && user ? "Welcome back." : "Ready when you are."}</h1>
            <p className="muted">
              {status === "authenticated" && user
                ? `Signed in as ${user.email}. Your test attempts and progress are saved to this account.`
                : "Sign in to save your attempts and keep your study progress together."}
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#practice">Start practicing <span aria-hidden="true">→</span></a>
              {status !== "authenticated" ? <a className="button button-secondary" href="/login">Sign in</a> : null}
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Questions available</div>
                <div className="stat-value">{bank ? bank.total.toLocaleString() : "—"}</div>
                <div className="stat-caption">Across the shared bank</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Subjects</div>
                <div className="stat-value">{bank ? bank.subjects.length : "—"}</div>
                <div className="stat-caption">Available to practice</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Account</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{status === "authenticated" ? "Active" : status === "loading" ? "…" : "Guest"}</div>
                <div className="stat-caption">{status === "authenticated" ? "Progress is saved" : "Sign in to save progress"}</div>
              </div>
            </div>
          </section>

          <section id="practice">
            <div className="section-heading">
              <div>
                <h2>Choose how to study</h2>
                <p>Pick a session that matches your goal.</p>
              </div>
            </div>
            <RequireSession>
              <div className="panel">
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
                  <strong>Practice setup</strong>
                  <span className="pill pill-accent">Personal session</span>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="mute">Session type</legend>
                  <div className="action-grid">
                    <label className={mode === "mock" ? "sel" : ""}>
                      <input type="radio" name="mode" value="mock" checked={mode === "mock"} onChange={() => setMode("mock")} />
                      <span><strong>Full mock test</strong><br /><span className="mute">Timed exam simulation</span></span>
                    </label>
                    <label className={mode === "practice" ? "sel" : ""}>
                      <input type="radio" name="mode" value="practice" checked={mode === "practice"} onChange={() => setMode("practice")} />
                      <span><strong>Subject practice</strong><br /><span className="mute">Focus on one subject</span></span>
                    </label>
                    <label className={mode === "mistakes" ? "sel" : ""}>
                      <input type="radio" name="mode" value="mistakes" checked={mode === "mistakes"} onChange={() => setMode("mistakes")} />
                      <span><strong>Revise mistakes</strong><br /><span className="mute">Revisit questions you missed</span></span>
                    </label>
                  </div>
                </fieldset>

                {mode !== "mock" ? (
                  <div className="row" style={{ alignItems: "end", marginTop: 14 }}>
                    <label style={{ flex: "1 1 220px", display: "block" }}>
                      <span className="mute">Subject</span>
                      <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                        {(bank?.subjects ?? []).map((s) => <option key={s.subject} value={s.subject}>{s.subject} ({s.count})</option>)}
                      </select>
                    </label>
                    <label style={{ width: 130, display: "block" }}>
                      <span className="mute">Questions</span>
                      <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />
                    </label>
                  </div>
                ) : (
                  <p className="warn">The current full mock follows the AP ECET CSE pattern: 200 questions in 180 minutes. Exam selection and custom exam patterns are part of the upcoming exam-management upgrade.</p>
                )}
                <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
                  <span className="mute">{bank ? `${bank.total} questions ready` : "Loading question bank…"}</span>
                  <button className="button button-primary" onClick={start} disabled={starting || !bank || (mode !== "mock" && !subject)}>
                    {starting ? "Preparing…" : "Start test"}
                  </button>
                </div>
              </div>
            </RequireSession>
          </section>
        </div>

        <aside className="stack">
          <section className="panel">
            <div className="panel-header"><h2>Quick access</h2></div>
            <div className="action-grid">
              <a className="action-card" href="#practice">
                <span className="action-icon">◷</span>
                <span className="action-title">Mock test</span>
                <span className="action-description">Simulate a timed exam</span>
              </a>
              <a className="action-card" href="#practice" onClick={() => setMode("practice")}>
                <span className="action-icon">◎</span>
                <span className="action-title">Practice</span>
                <span className="action-description">Study by subject</span>
              </a>
              <a className="action-card" href="#question-bank">
                <span className="action-icon">▤</span>
                <span className="action-title">Question bank</span>
                <span className="action-description">Browse available subjects</span>
              </a>
              <a className="action-card" href="/analytics">
                <span className="action-icon">↗</span>
                <span className="action-title">Analytics</span>
                <span className="action-description">Review accuracy and weak subjects</span>
              </a>
            </div>
          </section>

          <section id="question-bank" className="panel">
            {bank ? (
              <>
                <div className="panel-header">
                  <h2>Question bank by subject</h2>
                  <span className="pill">{bank.subjects.length}</span>
                </div>
                <p className="muted">Questions currently available in the shared library.</p>
                <div>
                  {bank.subjects.map((s) => (
                    <div className="row" key={s.subject} style={{ justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{s.subject}</span>
                      <span className="pill">{s.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="muted">Loading question bank…</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
