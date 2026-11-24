import { useEffect, useState } from "react";
const API=(import.meta.env.VITE_API_URL||"https://arctester.onrender.com").replace(/\/+$/,"");
const endpoint=API+"/mcp/admin";
const scopes=["questions:read","questions:create","questions:review","papers:create","papers:read","announcements:write","activity:read"];
type Key={id:string;name:string;scopes:string[];createdAt:string;lastUsedAt:string|null;revokedAt:string|null};
async function call<T>(path:string,init:RequestInit={}):Promise<T>{const r=await fetch(API+path,{...init,credentials:"include",headers:{"content-type":"application/json",...init.headers}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(typeof b.error==="string"?b.error:"Request failed.");return b as T;}
export default function AdminMcpAssistant(){
 const [keys,setKeys]=useState<Key[]>([]),[name,setName]=useState("ArcTester admin assistant"),[secret,setSecret]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){const r=await call<{keys:Key[]}>("/admin/mcp-keys");setKeys(r.keys);}
 useEffect(()=>{void refresh().catch(e=>setError((e as Error).message));},[]);
 async function create(){setBusy(true);setError("");setSecret("");try{const r=await call<{key:Key&{secret:string}}>("/admin/mcp-keys",{method:"POST",body:JSON.stringify({name,scopes})});setSecret(r.key.secret);setNotice("Key created. Copy it now; it is displayed only once.");await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function revoke(id:string){setBusy(true);try{await call("/admin/mcp-keys/"+encodeURIComponent(id)+"/revoke",{method:"POST"});await refresh();setNotice("Key revoked.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setNotice("Copied.");}catch{setError("Clipboard blocked; select and copy manually.");}}
 const config=JSON.stringify({url:endpoint,transport:"streamable-http",headers:{Authorization:secret?"Bearer "+secret:"Bearer <YOUR_ADMIN_MCP_KEY>"}},null,2);
 return <section className="admin-mcp-assistant">
  <div className="admin-page-heading"><div><p className="eyebrow">ADMIN TOOLING</p><h1>Mini Admin Assistant · MCP</h1><p>Connect an AI agent to approved administrator tools. It can draft questions, review sourced drafts, create unpublished papers, read exam results, and post announcements within its key scopes.</p></div><button className="ghost" disabled={busy} onClick={()=>void refresh()}>Refresh keys</button></div>
  {error&&<div className="error" role="alert">{error}</div>}{notice&&<div className="success" role="status">{notice}</div>}
  <article className="admin-card admin-mcp-card"><h2>Connect your AI client</h2><p>Generate a scoped key. The secret is returned once; stored credentials are hashed. Revoke a key immediately if it is exposed.</p>
   <label>Key label<input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label>
   <div className="mcp-scope-list">{scopes.map(s=><span key={s}>{s}</span>)}</div>
   <button className="primary" disabled={busy||name.trim().length<2} onClick={()=>void create()}>Create admin MCP key</button>
   {secret&&<div className="mcp-secret-box"><strong>Copy once and store securely.</strong><textarea rows={3} readOnly value={secret}/><button className="ghost" onClick={()=>void copy(secret)}>Copy secret</button></div>}
   <label>MCP endpoint<input readOnly value={endpoint}/></label><label>Client connection details<textarea rows={5} readOnly value={config}/></label><button className="ghost" onClick={()=>void copy(config)}>Copy connection details</button>
  </article>
  <article className="admin-card admin-mcp-card"><h2>Active and revoked keys</h2>{keys.length===0?<p>No administrator MCP keys yet.</p>:keys.map(k=><div className="mcp-key-row" key={k.id}><div><strong>{k.name}</strong><small>{k.scopes.join(" · ")}</small><small>{k.revokedAt?"Revoked":k.lastUsedAt?"Last used "+new Date(k.lastUsedAt).toLocaleString():"Not used yet"}</small></div>{!k.revokedAt&&<button className="danger" disabled={busy} onClick={()=>void revoke(k.id)}>Revoke</button>}</div>)}</article>
  <article className="admin-card admin-mcp-card"><h2>Available tools</h2><ul><li>Search the official question bank by subject, topic and review status.</li><li>Create question drafts; they are never auto-approved.</li><li>Approve sourced draft questions only with explicit confirmation.</li><li>Create an unpublished question paper from approved questions.</li><li>Read recent exam results and create student announcements.</li><li>Read sanitized MCP audit summaries.</li></ul><p className="muted">Paper creation does not publish or assign students. Assignment and publishing remain a separate explicit admin action.</p></article>
 </section>;
}
