"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type LearningConcept } from "../../lib/api";
import { useSession } from "../../lib/session";

export default function LearningPage() {
  const { status } = useSession();
  const [concepts, setConcepts] = useState<LearningConcept[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadConcepts(search = "") {
    setLoading(true);
    setError(null);
    try {
      const result = await api.learningConcepts(search);
      setConcepts(result.concepts);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load the concept library.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadConcepts();
  }, [status]);

  if (status === "loading") return <p className="mute">Checking your session…</p>;
  if (status !== "authenticated") {
    return (
      <section className="panel">
        <h1>Concept library</h1>
        <p className="muted">Sign in to browse concise explanations, examples and common mistakes.</p>
        <Link className="button button-primary" href="/login">Sign in</Link>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Concept library</h1>
            <p className="muted">Curated study notes with definitions, examples and common mistakes.</p>
          </div>
          <span className="pill">{concepts.length} concepts</span>
        </div>
        <form className="row" onSubmit={(event) => { event.preventDefault(); void loadConcepts(query); }}>
          <input
            aria-label="Search concepts"
            placeholder="Search concepts, subjects or keywords"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
          <button className="button button-secondary" type="button" disabled={loading && !query} onClick={() => { setQuery(""); void loadConcepts(""); }}>
            Clear
          </button>
        </form>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>

      {loading ? <p className="mute" role="status">Loading concepts…</p> : null}
      {!loading && concepts.length === 0 && !error ? (
        <section className="panel"><p className="muted">No concepts matched this search.</p></section>
      ) : null}
      <div className="stack">
        {concepts.map((concept) => (
          <article className="panel" key={concept.slug}>
            <div className="panel-header">
              <div>
                <h2>{concept.title}</h2>
                <p className="mute">{concept.subject} · {concept.topic}</p>
              </div>
            </div>
            <p>{concept.definition}</p>
            <h3>Examples</h3>
            <ul>{concept.examples.map((example) => <li key={example}>{example}</li>)}</ul>
            <h3>Related concepts</h3>
            <p className="muted">{concept.relatedConcepts.join(" · ")}</p>
            <h3>Common mistakes</h3>
            <ul>{concept.commonMistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul>
          </article>
        ))}
      </div>
      <div className="row">
        <Link className="button button-secondary" href="/analytics">Back to analytics</Link>
        <Link className="button button-secondary" href="/">Study dashboard</Link>
      </div>
    </div>
  );
}
