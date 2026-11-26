import { useEffect, useState } from "react";
import { request } from "./apiClient";

type Concept = {
  slug: string; title: string; subject: string; topic: string; definition: string;
  examples: string[]; relatedConcepts: string[]; commonMistakes: string[];
};
type LibraryResponse = { branch: { code: string | null; name: string | null }; subjects: string[]; count: number; concepts: Concept[] };
type Props = { setActivePage: (page: string) => void };

export default function StudentConceptLibrary({ setActivePage }: Props) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (subject) params.set("subject", subject);
    request<LibraryResponse>("/concept-library" + (params.size ? "?" + params.toString() : ""))
      .then((value) => { if (active) setResult(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load concepts."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, subject, retry]);

  const concepts = result?.concepts ?? [];
  const subjects = result?.subjects ?? [];

  return <div className="stack student-concept-library">
    <section className="page-intro">
      <p className="eyebrow">Your branch learning hub</p>
      <h1>Concept library</h1>
      <p className="muted">Clear explanations, examples and common mistakes, filtered to the concepts relevant to your diploma branch.</p>
      {result?.branch.name ? <span className="pill">Branch · {result.branch.name}{result.branch.code ? " (" + result.branch.code + ")" : ""}</span> : <div className="student-load-error"><p>Your branch profile is not set, so only shared concepts are shown.</p><button className="button button-secondary" onClick={() => setActivePage("account")}>Update academic profile</button></div>}
    </section>
    <section className="panel">
      <div className="panel-header"><div><h2>Explore concepts</h2><p className="muted">{result?.count ?? 0} concepts available for your branch</p></div></div>
      <div className="admin-two-col">
        <label>Search concepts<input aria-label="Search concepts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search concept, topic or explanation"/></label>
        <label>Subject<select aria-label="Filter concept subject" value={subject} onChange={(event) => setSubject(event.target.value)}><option value="">All subjects</option>{subjects.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      {loading && <p className="muted">Loading branch concepts…</p>}
      {error && <div className="student-load-error" role="alert"><p>{error}</p><button className="button button-secondary" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
      {!loading && !error && concepts.length === 0 && <div className="empty-state"><h3>No concepts match</h3><p className="muted">Try a different search. New branch content will appear here as it is curated.</p></div>}
      <div className="student-concept-grid">{concepts.map((concept) => <article className="student-concept-card" key={concept.slug}>
        <div className="student-concept-card-head"><span className="pill">{concept.subject}</span><small>{concept.topic}</small></div>
        <h3>{concept.title}</h3>
        <p>{concept.definition}</p>
        {concept.examples.length > 0 && <section><h4>Examples</h4><ul>{concept.examples.map((example) => <li key={example}>{example}</li>)}</ul></section>}
        {concept.relatedConcepts.length > 0 && <section><h4>Related concepts</h4><p className="muted">{concept.relatedConcepts.join(" · ")}</p></section>}
        {concept.commonMistakes.length > 0 && <section><h4>Watch out for</h4><ul>{concept.commonMistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul></section>}
      </article>)}</div>
    </section>
  </div>;
}
