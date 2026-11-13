import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";
import type { LearningConcept } from "./lib/api";

export interface StudentLearningProps {
  setActivePage: (page: string) => void;
}

export default function StudentLearning({ setActivePage }: StudentLearningProps) {
  const [concepts, setConcepts] = useState<LearningConcept[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const loadConcepts = useCallback(async (search = "") => {
    cancelledRef.current = true;
    const generation = ++cancelledRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const suffix = params.toString();
      const result = await request<{ total: number; concepts: LearningConcept[] }>(
        "/learning/concepts" + (suffix ? "?" + suffix : ""),
      );
      if (generation !== cancelledRef.current) return;
      setConcepts(result.concepts);
    } catch (cause) {
      if (generation !== cancelledRef.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load the concept library.");
    } finally {
      if (generation === cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConcepts();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadConcepts]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadConcepts(query);
  };

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
        <form className="row" onSubmit={handleSearch}>
          <input
            aria-label="Search concepts"
            placeholder="Search concepts, subjects or keywords"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
          <button className="button button-secondary" type="button" disabled={loading} onClick={() => { setQuery(""); void loadConcepts(""); }}>
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
          <article className="panel" id={concept.slug} key={concept.slug}>
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
        <button className="button button-secondary" onClick={() => setActivePage("analytics")}>Back to analytics</button>
        <button className="button button-secondary" onClick={() => setActivePage("dashboard")}>Study dashboard</button>
      </div>
    </div>
  );
}
