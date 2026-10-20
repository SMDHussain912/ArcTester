"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError, type TestResult } from "../../../lib/api";

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const attemptId = Number(params.id);

  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      setError("That result link is not valid.");
      return;
    }
    api
      .result(attemptId)
      .then(setResult)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Could not load the result.")
      );
  }, [attemptId]);

  if (error) {
    return (
      <>
        <h1>Result</h1>
        <p className="error">{error}</p>
        <button className="alt" onClick={() => router.push("/")}>
          Back to home
        </button>
      </>
    );
  }

  if (!result) return <p className="mute">Loading result…</p>;

  const percent = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  const wrong = result.questions.filter((q) => !q.isCorrect);

  return (
    <>
      <h1>Result</h1>

      {result.expired ? (
        <p className="warn">This test was submitted after the time limit and marked expired.</p>
      ) : null}

      <div className="card">
        <div className="big">
          {result.score} / {result.total}
        </div>
        <p className="mute">{percent}% correct</p>
        <table>
          <caption className="mute" style={{ textAlign: "left" }}>
            Per-subject breakdown
          </caption>
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">Correct</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {result.breakdown.map((row) => (
              <tr key={row.subject}>
                <td>{row.subject}</td>
                <td>{row.correct}</td>
                <td>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Review ({wrong.length} to revise)</h2>
      {wrong.length === 0 ? (
        <div className="card">
          <p>Nothing to revise — every answer was correct.</p>
        </div>
      ) : (
        wrong.map((q, i) => (
          <div className="card" key={q.questionId}>
            <p>
              <b>
                {i + 1}. {q.text}
              </b>
            </p>
            <p className="mute">Subject: {q.subject}</p>
            <ul style={{ paddingLeft: 20 }}>
              {q.options.map((option, optionIndex) => (
                <li key={optionIndex}>
                  {option}
                  {optionIndex === q.correctIndex ? " ✓ correct" : ""}
                  {q.selectedIndex === optionIndex ? " — your answer" : ""}
                </li>
              ))}
            </ul>
            {q.explanation ? <div className="exp">{q.explanation}</div> : null}
          </div>
        ))
      )}

      <button className="alt" onClick={() => router.push("/")}>
        Back to home
      </button>
    </>
  );
}
