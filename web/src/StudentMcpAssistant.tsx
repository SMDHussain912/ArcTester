import { useEffect, useState } from "react";
import { API, request } from "./apiClient";

type McpKey = { id: string; name: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
type PrivateQuestion = { id: string; subject: string; topic: string; text: string; options: string[]; difficulty: string; updatedAt: string };
type PracticeSet = { id: string; title: string; description: string; durationMinutes: number; questions: unknown[]; updatedAt: string };

const scopes = ["questions:read", "questions:write", "practice:read", "practice:write"];
const endpoint = API + "/mcp/student";

export default function StudentMcpAssistant() {
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [questions, setQuestions] = useState<PrivateQuestion[]>([]);
  const [tests, setTests] = useState<PracticeSet[]>([]);
  const [name, setName] = useState("My AI study assistant");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [keyResult, questionResult, testResult] = await Promise.all([
      request<{ keys: McpKey[] }>("/student/mcp-keys"),
      request<{ questions: PrivateQuestion[] }>("/student/private-questions?limit=50"),
      request<{ practiceTests: PracticeSet[] }>("/student/practice-sets"),
    ]);
    setKeys(keyResult.keys);
    setQuestions(questionResult.questions);
    setTests(testResult.practiceTests);
  }
  useEffect(() => { void refresh().catch((e) => setError((e as Error).message)); }, []);

  async function createKey() {
    setBusy(true); setError(""); setNotice(""); setSecret("");
    try {
      const result = await request<{ key: McpKey & { secret: string } }>("/student/mcp-keys", {
        method: "POST", body: JSON.stringify({ name, scopes }),
      });
      setSecret(result.key.secret);
      setNotice("MCP key created. Copy it now; the secret is shown only once.");
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError("");
    try { await request("/student/mcp-keys/" + encodeURIComponent(id) + "/revoke", { method: "POST" }); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice("Copied to clipboard."); }
    catch { setError("Clipboard access was blocked. Select and copy the text manually."); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "questions" in parsed ? (parsed as { questions: unknown }).questions : null;
      if (!Array.isArray(list) || list.length === 0) throw new Error("Upload a JSON array of questions or an object with a questions array.");
      const result = await request<{ imported: number }>("/student/private-questions/import", { method: "POST", body: JSON.stringify({ questions: list }) });
      setNotice("Imported " + result.imported + " private question(s).");
      await refresh();
    } catch (e) { setError((e as Error).message || "Could not import questions."); }
    finally { setBusy(false); }
  }

  const config = JSON.stringify({ url: endpoint, transport: "streamable-http", headers: { Authorization: secret ? "Bearer " + secret : "Bearer <YOUR_STUDENT_MCP_KEY>" } }, null, 2);
  return (
    <section className="student-mcp-page">
      <header className="page-header">
        <div><p className="eyebrow">PERSONAL AI WORKSPACE</p><h1>AI Practice & MCP</h1><p>Connect your own AI assistant to your private question bank and practice tests. Your content stays separate from the official ArcTester question bank.</p></div>
        <button type="button" className="ghost" disabled={busy} onClick={() => void refresh()}>Refresh</button>
      </header>
      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="success" role="status">{notice}</div>}
      <article className="card student-mcp-card">
        <h2>Connect your AI</h2>
        <p>Create a personal key, then add the MCP endpoint to an AI client that supports remote Streamable HTTP MCP servers.</p>
        <label>Key name<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
        <div className="mcp-scope-list">{scopes.map((scope) => <span key={scope}>{scope}</span>)}</div>
        <button type="button" className="primary" disabled={busy || name.trim().length < 2} onClick={() => void createKey()}>Create student MCP key</button>
        {secret && <div className="mcp-secret-box"><strong>Copy this key now — it will not be shown again.</strong><textarea readOnly rows={3} value={secret} /><button type="button" className="ghost" onClick={() => void copy(secret)}>Copy key</button></div>}
        <label>MCP endpoint<input readOnly value={endpoint} /></label>
        <label>Connection details<textarea readOnly rows={5} value={config} /></label>
        <button type="button" className="ghost" onClick={() => void copy(config)}>Copy connection details</button>
      </article>
      <article className="card student-mcp-card">
        <h2>Your MCP keys</h2>
        {keys.length === 0 ? <p>No keys created yet.</p> : keys.map((key) => <div className="mcp-key-row" key={key.id}><div><strong>{key.name}</strong><small>{key.scopes.join(" · ")}</small><small>{key.revokedAt ? "Revoked" : key.lastUsedAt ? "Last used " + new Date(key.lastUsedAt).toLocaleString() : "Not used yet"}</small></div>{!key.revokedAt && <button type="button" className="danger" disabled={busy} onClick={() => void revoke(key.id)}>Revoke</button>}</div>)}
      </article>
      <article className="card student-mcp-card">
        <h2>Upload private questions</h2>
        <p>Upload a JSON file to your personal bank. Supported fields: subject, topic, text, options, correctIndex, explanation, difficulty.</p>
        <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { void importFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        <p><strong>{questions.length}</strong> questions loaded in the current list</p>
        {questions.slice(0, 8).map((q) => <div className="mcp-question-row" key={q.id}><strong>{q.subject} / {q.topic}</strong><p>{q.text}</p><button type="button" className="danger" disabled={busy} onClick={async () => { try { await request("/student/private-questions/" + encodeURIComponent(q.id), { method: "DELETE" }); await refresh(); } catch (e) { setError((e as Error).message); } }}>Delete</button></div>)}
      </article>
      <article className="card student-mcp-card">
        <h2>AI-created practice tests</h2>
        <p>Your connected AI can create and edit private test packages using the MCP tools. These are practice content, not official assigned exams.</p>
        {tests.length === 0 ? <p>No AI practice tests saved yet. Ask your connected AI to build one and save it with <code>create_my_practice_test</code>.</p> : tests.map((test) => <div className="mcp-key-row" key={test.id}><div><strong>{test.title}</strong><small>{test.questions.length} questions · {test.durationMinutes} min</small><small>{test.description}</small></div><button type="button" className="danger" disabled={busy} onClick={async () => { try { await request("/student/practice-sets/" + encodeURIComponent(test.id), { method: "DELETE" }); await refresh(); } catch (e) { setError((e as Error).message); } }}>Delete</button></div>)}
      </article>
    </section>
  );
}
