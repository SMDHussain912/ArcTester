"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, isAuthError, type BankInfo } from "../../lib/api";
import { RequireSession, useSession } from "../../lib/session";

type PaperMode = "mock" | "practice" | "mistakes";
type Stage = "select" | "instructions";

function PracticePaperChooser() {
  const router = useRouter();
  const { refresh } = useSession();
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [mode, setMode] = useState<PaperMode>("mock");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [mistakeSubject, setMistakeSubject] = useState("");
  const [count, setCount] = useState(20);
  const [stage, setStage] = useState<Stage>("select");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.bank().then((value) => {
      if (!active) return;
      setBank(value);
      const first = value.subjects[0]?.subject ?? "";
      setSelectedSubjects(first ? [first] : []);
      setMistakeSubject(first);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof ApiError ? cause.message : "Could not load available practice subjects.");
    });
    return () => { active = false; };
  }, []);

  const chosenSubjectRows = useMemo(
    () => (bank?.subjects ?? []).filter((item) => selectedSubjects.includes(item.subject)),
    [bank, selectedSubjects]
  );
  const availableTopics = useMemo(() => {
    const unique = new Map<string, number>();
    for (const subject of chosenSubjectRows) {
      for (const topic of (subject.topics ?? [])) unique.set(topic.topic, (unique.get(topic.topic) ?? 0) + topic.count);
    }
    return [...unique.entries()].map(([topic, available]) => ({ topic, available }));
  }, [chosenSubjectRows]);
  const availableCount = useMemo(() => {
    if (selectedSubjects.length === 0) return 0;
    if (selectedTopics.length === 0) return chosenSubjectRows.reduce((sum, subject) => sum + subject.count, 0);
    return chosenSubjectRows.reduce((sum, subject) => sum + (subject.topics ?? []).filter((topic) => selectedTopics.includes(topic.topic)).reduce((n, topic) => n + topic.count, 0), 0);
  }, [chosenSubjectRows, selectedSubjects, selectedTopics]);
  const questionCount = mode === "mock" ? 200 : mode === "mistakes" ? count : Math.min(count, availableCount);
  const durationMinutes = mode === "mock" ? 180 : Math.max(5, Math.round(questionCount * 0.9));

  function changeMode(next: PaperMode) {
    setMode(next);
    setStage("select");
    setError("");
    if (next === "practice" && selectedSubjects.length === 0 && bank?.subjects[0]) {
      setSelectedSubjects([bank.subjects[0].subject]);
    }
  }
  function toggleSubject(subject: string) {
    const nextSubjects = selectedSubjects.includes(subject)
      ? selectedSubjects.filter((value) => value !== subject)
      : [...selectedSubjects, subject];
    setSelectedSubjects(nextSubjects);
    const validTopics = new Set((bank?.subjects ?? [])
      .filter((item) => nextSubjects.includes(item.subject))
      .flatMap((item) => (item.topics ?? []).map((topic) => topic.topic)));
    setSelectedTopics((current) => current.filter((topic) => validTopics.has(topic)));
  }
  function toggleTopic(topic: string) {
    setSelectedTopics((current) => current.includes(topic)
      ? current.filter((value) => value !== topic)
      : [...current, topic]);
  }

  async function startExam() {
    setStarting(true);
    setError("");
    try {
      const body: { mode: PaperMode; subjects?: string[]; subject?: string; topics?: string[]; count?: number } = { mode };
      if (mode === "practice") {
        body.subjects = selectedSubjects;
        body.count = Math.min(count, 200);
        if (selectedTopics.length) body.topics = selectedTopics;
      } else if (mode === "mistakes") {
        body.subject = mistakeSubject;
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

  const canReview = Boolean(bank) && (mode === "mock" ||
    (mode === "practice" && selectedSubjects.length > 0 && availableCount > 0) ||
    (mode === "mistakes" && Boolean(mistakeSubject)));

  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">Practice centre</p>
        <h1>Build your question paper</h1>
        <p className="muted">Choose an exam format, select subjects, optionally narrow the paper by topic, then review the instructions before starting.</p>
      </section>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {stage === "select" ? (
        <div className="stack">
          <div className="action-grid" role="group" aria-label="Practice mode">
            <button type="button" aria-pressed={mode === "mock"} className={mode === "mock" ? "action-card sel" : "action-card"} onClick={() => changeMode("mock")}>
              <span className="eyebrow">Exam simulation</span>
              <h2>Full AP ECET CSE Mock</h2>
              <p className="muted">Full-length exam simulation using the configured AP ECET CSE subject blueprint.</p>
              <strong>200 questions · 180 minutes</strong>
            </button>
            <button type="button" aria-pressed={mode === "practice"} className={mode === "practice" ? "action-card sel" : "action-card"} onClick={() => changeMode("practice")}>
              <span className="eyebrow">Build your own paper</span>
              <h2>Custom Subject Practice</h2>
              <p className="muted">Select one or more subjects. Topic selection is optional; leave topics empty to include the full subject syllabus.</p>
              <strong>Subject-first · Optional topic filter</strong>
            </button>
            <button type="button" aria-pressed={mode === "mistakes"} className={mode === "mistakes" ? "action-card sel" : "action-card"} onClick={() => changeMode("mistakes")}>
              <span className="eyebrow">Revision</span>
              <h2>Revise Mistakes</h2>
              <p className="muted">Reattempt questions you previously answered incorrectly in a selected subject.</p>
              <strong>Personal revision paper</strong>
            </button>
          </div>

          {mode === "practice" ? (
            <section className="panel stack">
              <div>
                <h2>1. Select subjects</h2>
                <p className="muted">You can combine multiple subjects in one paper. Questions will be distributed as evenly as the available question bank allows.</p>
              </div>
              {!bank ? <p className="mute">Loading subjects…</p> : (
                <div className="action-grid">
                  {bank.subjects.map((item) => (
                    <label key={item.subject} className="stat-card" style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={selectedSubjects.includes(item.subject)} onChange={() => toggleSubject(item.subject)} />
                      <span><strong>{item.subject}</strong><br /><small className="muted">{item.count} questions available</small></span>
                    </label>
                  ))}
                </div>
              )}
              <div>
                <h2>2. Topics <span className="muted">(optional)</span></h2>
                <p className="muted">No topic selected means all topics under the selected subjects are eligible.</p>
                {availableTopics.length === 0 ? <p className="mute">Select subjects with topic-tagged questions to see topic filters.</p> : (
                  <div className="action-grid">
                    {availableTopics.map((item) => (
                      <label key={item.topic} className="stat-card" style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                        <input type="checkbox" checked={selectedTopics.includes(item.topic)} onChange={() => toggleTopic(item.topic)} />
                        <span><strong>{item.topic}</strong><br /><small className="muted">{item.available} matching questions</small></span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <label>3. Number of questions
                <input type="number" min={1} max={200} value={count} onChange={(event) => setCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} />
              </label>
              <p className="muted">{availableCount} questions match your current subject and topic selection. The paper will contain up to {Math.min(count, availableCount)} questions.</p>
            </section>
          ) : null}

          {mode === "mistakes" ? (
            <section className="panel stack">
              <h2>Configure revision paper</h2>
              <label>Subject
                <select value={mistakeSubject} onChange={(event) => setMistakeSubject(event.target.value)}>
                  {(bank?.subjects ?? []).map((item) => <option key={item.subject} value={item.subject}>{item.subject}</option>)}
                </select>
              </label>
              <label>Maximum questions
                <input type="number" min={1} max={200} value={count} onChange={(event) => setCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} />
              </label>
            </section>
          ) : null}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <Link className="button button-secondary" href="/">Back to dashboard</Link>
            <button className="button button-primary" disabled={!canReview || starting} onClick={() => { setError(""); setStage("instructions"); }}>Review paper details →</button>
          </div>
        </div>
      ) : (
        <section className="panel stack">
          <p className="eyebrow">Pre-exam verification</p>
          <h1>Confirm your paper</h1>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-label">Paper type</div><div className="stat-value" style={{ fontSize: 18 }}>{mode === "mock" ? "Full mock" : mode === "practice" ? "Custom subject practice" : "Mistake revision"}</div></div>
            <div className="stat-card"><div className="stat-label">Questions requested</div><div className="stat-value">{questionCount}</div></div>
            <div className="stat-card"><div className="stat-label">Estimated duration</div><div className="stat-value">{durationMinutes} min</div></div>
            <div className="stat-card"><div className="stat-label">Subjects</div><div className="stat-value" style={{ fontSize: 16 }}>{mode === "mock" ? "All ECET subjects" : mode === "practice" ? selectedSubjects.join(", ") : mistakeSubject}</div></div>
          </div>
          {mode === "practice" && selectedTopics.length > 0 ? <p><strong>Topic filter:</strong> {selectedTopics.join(", ")}</p> : null}
          <h2>Instructions for candidates</h2>
          <ol>
            <li>Read every question carefully and select one answer.</li>
            <li>Use the question palette to move between questions.</li>
            <li>Review unanswered questions before submitting.</li>
            <li>Do not refresh or close the exam tab while the paper is in progress.</li>
            <li>The countdown begins after you start. The test is submitted when time expires.</li>
            <li>Only the questions in this generated paper are included in your result.</li>
          </ol>
          <p className="warn">Starting the paper creates an attempt. Once the timer begins, manage your time carefully.</p>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="button button-secondary" onClick={() => { setStarting(false); setStage("select"); }} disabled={starting}>Back to paper selection</button>
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
