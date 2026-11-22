import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";
import type { LearningConcept } from "./lib/api";
import Skeleton from "./components/Skeleton";

export interface StudentLearningProps {
  setActivePage: (page: string) => void;
}

export default function StudentLearning({ setActivePage }: StudentLearningProps) {
  const [concepts, setConcepts] = useState<LearningConcept[]>([]);
  const [conceptTotal, setConceptTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef<number>(0);

  const loadConcepts = useCallback(async (search = "") => {
    cancelledRef.current = Date.now();
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
      const rows = Array.isArray(result?.concepts) ? result.concepts : [];
      setConceptTotal(Number.isFinite(result?.total) ? Math.max(0, Number(result.total)) : rows.length);
      setConcepts(rows.filter(Boolean).map((concept) => ({
        ...concept,
        slug: String(concept.slug ?? ""),
        title: String(concept.title ?? "Untitled concept"),
        subject: String(concept.subject ?? "General"),
        topic: String(concept.topic ?? "General"),
        definition: String(concept.definition ?? ""),
        examples: Array.isArray(concept.examples) ? concept.examples.filter((item): item is string => typeof item === "string") : [],
        relatedConcepts: Array.isArray(concept.relatedConcepts) ? concept.relatedConcepts.filter((item): item is string => typeof item === "string") : [],
        commonMistakes: Array.isArray(concept.commonMistakes) ? concept.commonMistakes.filter((item): item is string => typeof item === "string") : [],
      })));
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
      cancelledRef.current = Date.now();
    };
  }, [loadConcepts]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadConcepts(query);
  };

  return (
    <div className="stack student-learning">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Concept library</h1>
            <p className="muted">Curated study notes with definitions, examples and common mistakes.</p>
          </div>
          <span className="pill">{conceptTotal} concepts</span>
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

      {loading ? (
        <div className="stack" style={{ gap: 10 }}>
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
        </div>
      ) : null}
      {!loading && concepts.length === 0 && !error ? (
        <section className="panel concept-empty-state">
          <strong>{query.trim() ? "No concepts matched this search." : "The concept library is empty on the server."}</strong>
          <p className="muted">{query.trim() ? "Try a different keyword, subject or topic." : "This library contains curated ECET study notes—definitions, examples, related concepts and common mistakes. An administrator needs to publish or seed the concept content."}</p>
        </section>
      ) : null}
      <div className="stack">
        {concepts.map((concept) => (
          <article className="panel" id={concept.slug} key={concept.slug}>
            <div className="panel-header">
              <div>
                <h2>{concept.title}</h2>
                <p className="muted">{concept.subject} · {concept.topic}</p>
              </div>
            </div>
            <p>{concept.definition}</p>
            <h3>Examples</h3>
            <ul>{concept.examples.map((example: string) => <li key={example}>{example}</li>)}</ul>
            <h3>Related concepts</h3>
            <p className="muted">{concept.relatedConcepts.join(" · ")}</p>
            <h3>Common mistakes</h3>
            <ul>{concept.commonMistakes.map((mistake: string) => <li key={mistake}>{mistake}</li>)}</ul>
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
