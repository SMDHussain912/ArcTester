import { useEffect, useState } from "react";

type Branch = { name: string; code: string; studentCount: number };
type Institution = {
  collegeName: string;
  collegeCode: string;
  studentCount: number;
  branchCount: number;
  branches: Branch[];
};
type ResponseData = {
  institutions: Institution[];
  page: number;
  total: number;
  totalPages: number;
  generatedAt: string;
};

type Props = { onError: (message: string) => void };

const API = (import.meta.env.VITE_API_URL || "https://arctester.onrender.com").replace(/\/+$/, "");

async function request<T>(path: string): Promise<T> {
  const response = await fetch(API + path, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status >= 500
    ? "ArcTester couldn't load the institution directory. Please try again."
    : typeof body.error === "string" ? body.error : "Request failed.");
  return body as T;
}

export default function AdminInstitutionDirectory({ onError }: Props) {
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (query.trim()) params.set("q", query.trim());
    if (branch.trim()) params.set("branch", branch.trim());
    request<ResponseData>("/admin/institutions?" + params.toString())
      .then((result) => { if (active) setData(result); })
      .catch((error: unknown) => {
        if (active) onError(error instanceof Error ? error.message : "Could not load institutions.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, branch, page, retry, onError]);

  const institutions = data?.institutions ?? [];
  const studentTotal = institutions.reduce((sum, item) => sum + item.studentCount, 0);

  return <section className="admin-institution-directory">
    <div className="admin-page-title">
      <div>
        <p className="eyebrow">INSTITUTION OPERATIONS</p>
        <h1>Institutions & branches</h1>
        <p>Explore colleges and diploma branches represented by registered students.</p>
      </div>
      <button className="ghost" type="button" onClick={() => setRetry((value) => value + 1)} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh"}
      </button>
    </div>

    <div className="admin-stat-grid admin-institution-stats">
      <article><span>Institutions in view</span><b>{data?.total ?? "—"}</b><small>Filtered directory results</small></article>
      <article><span>Students in view</span><b>{studentTotal.toLocaleString()}</b><small>Non-rejected student profiles</small></article>
      <article><span>Branches in view</span><b>{institutions.reduce((sum, item) => sum + item.branchCount, 0).toLocaleString()}</b><small>Distinct college/branch combinations</small></article>
      <article><span>Data source</span><b>Profiles</b><small>Custom entries included automatically</small></article>
    </div>

    <div className="admin-panel">
      <div className="admin-toolbar admin-institution-filters">
        <input aria-label="Search institution" placeholder="Search college name or PIN code…" value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <input aria-label="Filter branch" placeholder="Filter branch name or code…" value={branch}
          onChange={(event) => { setBranch(event.target.value); setPage(1); }} />
      </div>
      {loading && <p className="muted" role="status">Loading institutions…</p>}
      {!loading && institutions.length === 0 && <div className="empty-state">
        <h3>No institutions found</h3>
        <p>Institutions appear when students register with their college name and PIN code. Custom entries are supported.</p>
      </div>}
      <div className="admin-institution-list">
        {institutions.map((item) => <article className="admin-institution-card" key={(item.collegeCode || "no-code") + "::" + item.collegeName}>
          <div className="admin-institution-heading">
            <div><span className="pill">{item.collegeCode || "No PIN code"}</span><h2>{item.collegeName || "Unnamed institution"}</h2></div>
            <strong>{item.studentCount.toLocaleString()} students</strong>
          </div>
          <div className="admin-institution-branches">
            {item.branches.map((row) => <div className="admin-institution-branch" key={(row.code || "no-code") + "::" + row.name}>
              <span><b>{row.name || "Unnamed branch"}</b><small>{row.code || "Custom branch"} · {row.studentCount} students</small></span>
            </div>)}
            {item.branches.length === 0 && <p className="muted">No branch information registered yet.</p>}
          </div>
        </article>)}
      </div>
      {data && data.totalPages > 1 && <div className="pagination">
        <button className="ghost" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <span>Page {page} of {data.totalPages}</span>
        <button className="ghost" disabled={page >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
      </div>}
      {data?.generatedAt && <p className="muted admin-institution-updated">Updated {new Date(data.generatedAt).toLocaleString()}</p>}
    </div>
  </section>;
}
