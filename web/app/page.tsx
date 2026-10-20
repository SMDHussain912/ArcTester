"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type BankInfo } from "../lib/api";

type Mode = "mock" | "practice" | "mistakes";

export default function HomePage() {
  const router = useRouter();
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("mock");
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(20);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api
      .bank()
      .then((info) => {
        setBank(info);
        setSubject((current) => current || info.subjects[0]?.subject || "");
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Could not load the question bank.")
      );
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
      setError(e instanceof ApiError ? e.message : "Could not start the test.");
      setStarting(false);
    }
  }

  return (
    <>
      <h1>AP ECET CSE Mock Test</h1>
      <p className="mute">
        Works offline. Unseen questions come first, then your mistakes, then the oldest.
      </p>

      {error ? <p className="error">{error}</p> : null}

      <div className="card">
        {bank ? (
          <>
            <b>{bank.total}</b> questions across <b>{bank.subjects.length}</b> subjects
          </>
        ) : (
          <span className="mute">Loading question bank…</span>
        )}
      </div>

      <div className="card">
        <h2>Start a test</h2>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="mute">Mode</legend>
          {(
            [
              ["mock", "Full mock — official pattern (200 Q, 180 min)"],
              ["practice", "Practice one subject"],
              ["mistakes", "Revise my mistakes"],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ border: 0, padding: "2px 0" }}>
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        {mode !== "mock" ? (
          <div className="row" style={{ marginTop: 12 }}>
            <label style={{ border: 0, padding: 0 }}>
              <span className="mute">Subject</span>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                {(bank?.subjects ?? []).map((s) => (
                  <option key={s.subject} value={s.subject}>
                    {s.subject} ({s.count})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ border: 0, padding: 0 }}>
              <span className="mute">Questions</span>
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                style={{ width: 90 }}
              />
            </label>
          </div>
        ) : (
          <p className="warn">
            The full mock uses Maths 50, Physics 25, Chemistry 25 and 100 CSE questions in the
            official unit split. Missing questions are skipped with a warning.
          </p>
        )}

        <button onClick={start} disabled={starting || !bank}>
          {starting ? "Starting…" : "Start test"}
        </button>
      </div>

      {bank && bank.subjects.length > 0 ? (
        <div className="card">
          <h2>Question bank by subject</h2>
          <table>
            <caption className="mute" style={{ textAlign: "left" }}>
              Questions available per subject
            </caption>
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Questions</th>
              </tr>
            </thead>
            <tbody>
              {bank.subjects.map((s) => (
                <tr key={s.subject}>
                  <td>{s.subject}</td>
                  <td>{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
