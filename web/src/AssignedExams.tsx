import { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");
type Assignment = {
  id:string; status:string; assignedAt:string; availableFrom:string|null; dueAt:string|null;
  exam:{id:string;title:string;description:string}; version:number; durationMinutes:number;
  questionCount:number; submission:{id:string;status:string;score:number|null;maximumScore:number|null}|null;
};
type ExamPackage = {
  assignmentId:string; title:string; description:string; version:number; instructions:string;
  durationMinutes:number; serverTime:string;
  questions:{id:string;position:number;subject:string;topic:string|null;text:string;options:string[];optionOrder:number[];marks:number;negativeMarks:number}[];
};
type ExamResult = {status:string;score:number;maximumScore:number;questions:{id:string;position:number;subject:string;topic:string|null;text:string;options:string[];correctIndex:number;selectedIndex:number|null;isCorrect:boolean;awardedMarks:number;marks:number;negativeMarks:number;explanation:string}[]};
function createUuid():string {
 if(typeof crypto!=="undefined"&&"randomUUID" in crypto)return crypto.randomUUID();
 return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,char=>{const value=Math.random()*16|0;return (char==="x"?value:(value&3|8)).toString(16);});
}
async function request<T>(path:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(API+path,{...init,credentials:"include",headers:{"content-type":"application/json",...init.headers}});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body.error||"The request failed.");
 return body as T;
}
export default function AssignedExams(){
 const [items,setItems]=useState<Assignment[]>([]),[active,setActive]=useState<ExamPackage|null>(null),[activeId,setActiveId]=useState(""),[startedAt,setStartedAt]=useState(""),[attemptUuid,setAttemptUuid]=useState(""),[answers,setAnswers]=useState<Record<string,number>>({}),[remaining,setRemaining]=useState(0),[result,setResult]=useState<ExamResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[autoSubmitTriggered,setAutoSubmitTriggered]=useState(false);
 async function load(){try{const r=await request<{assignments:Assignment[]}>("/exams/assigned");setItems(Array.isArray(r.assignments) ? r.assignments : []);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function start(id:string){setBusy(true);setError("");setResult(null);try{const r=await request<{package:ExamPackage}>(`/exams/assignments/${id}/package`);setActive(r.package);setActiveId(id);setStartedAt(new Date().toISOString());setAttemptUuid(createUuid());setAutoSubmitTriggered(false);setAnswers({});setRemaining(r.package.durationMinutes*60);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function submit(){if(!active||busy||result)return;setBusy(true);setError("");try{await request(`/exams/assignments/${activeId}/submission`,{method:"POST",body:JSON.stringify({attemptUuid,startedAt,submittedAt:new Date().toISOString(),answers:active.questions.map(q=>({examQuestionId:q.id,selectedIndex:answers[q.id]===undefined?null:q.optionOrder[answers[q.id]]}))})});const r=await request<{result:ExamResult}>(`/exams/assignments/${activeId}/result`);setResult({ ...r.result, questions: Array.isArray(r.result?.questions) ? r.result.questions : [] });await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{if(!active||result||busy)return;const timer=window.setInterval(()=>setRemaining(value=>Math.max(0,value-1)),1000);return()=>window.clearInterval(timer);},[active,result,busy]);
 useEffect(()=>{if(active&&remaining===0&&!result&&!busy&&!autoSubmitTriggered){setAutoSubmitTriggered(true);void submit();}},[active,remaining,result,busy,autoSubmitTriggered]);
 function close(){setActive(null);setResult(null);setActiveId("");setAnswers({});void load();}
 const clock=`${Math.floor(remaining/60).toString().padStart(2,"0")}:${(remaining%60).toString().padStart(2,"0")}`;
 return <section className="assigned-exams-section">
  <div className="section-head"><div><p className="eyebrow">EXAMINER ASSIGNMENTS</p><h2>Assigned mock tests</h2></div><button className="ghost" onClick={()=>void load()}>Refresh</button></div>
  {error&&<p className="error">{error}</p>}
  {active?<div className="assigned-runner panel">{result?<><div className="page-heading"><div><p className="eyebrow">EXAM SUBMITTED</p><h2>{active.title}</h2></div><button className="ghost" onClick={close}>Back to dashboard</button></div><div className="panel score-panel"><strong>{result.score} / {result.maximumScore}</strong><span className="muted">Final score · {result.status}</span></div>{result.questions.map((q,i)=><article className="panel question-card" key={q.id}><p className="eyebrow">QUESTION {i+1} · {q.subject}</p><h3>{q.text}</h3><p className={q.isCorrect?"success":"error"}>{q.isCorrect?"Correct":q.selectedIndex===null?"Not answered":"Incorrect"} · {q.awardedMarks} marks</p><p className="muted">{q.explanation}</p></article>)}</>:<><div className="page-heading"><div><p className="eyebrow">TIMED EXAM · VERSION {active.version}</p><h2>{active.title}</h2><p className="muted">{active.questions.length} questions · {active.durationMinutes} minutes</p></div><div className={remaining<300?"exam-clock urgent":"exam-clock"}>{clock}</div></div><div className="exam-instructions"><b>Instructions</b><p>{active.instructions||"Choose one answer for each question. You can leave questions unanswered."}</p></div>{active.questions.map((q,i)=><article className="panel question-card" key={q.id}><p className="eyebrow">QUESTION {i+1} · {q.subject}{q.topic?" / "+q.topic:""} · +{q.marks} / −{q.negativeMarks}</p><h3>{q.text}</h3><div className="options">{q.options.map((option,index)=><button key={index} className={answers[q.id]===index?"option selected":"option"} onClick={()=>setAnswers(old=>({...old,[q.id]:index}))}><span>{String.fromCharCode(65+index)}</span>{option}</button>)}</div></article>)}<div className="exam-submit-bar"><span>{Object.keys(answers).length} / {active.questions.length} answered</span><button className="primary" disabled={busy} onClick={()=>void submit()}>{busy?"Submitting…":"Submit exam"}</button></div></>}</div>:<div className="assigned-exam-list">{items.map(item=><article className="panel assigned-exam-card" key={item.id}><div><p className="eyebrow">VERSION {item.version} · {item.questionCount} QUESTIONS</p><h3>{item.exam.title}</h3><p className="muted">{item.durationMinutes} minutes{item.dueAt?" · Due "+new Date(item.dueAt).toLocaleString():""}</p></div><div>{item.submission?<span className="status status-used">Submitted · {item.submission.score??"—"}/{item.submission.maximumScore??"—"}</span>:<button className="primary" disabled={busy} onClick={()=>void start(item.id)}>Start exam →</button>}</div></article>)}{!items.length&&<div className="panel empty-state">No exams have been assigned to your account yet.</div>}</div>}
 </section>;
}
