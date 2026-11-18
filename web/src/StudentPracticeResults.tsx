import { useState } from "react";

export type AnswerExplanation = {
 answer: string;
 summary: string;
 reasoning: string[];
 optionAnalysis: { option: string; explanation: string; isCorrect: boolean }[];
 takeaway: string;
 misconception: string;
 provider: string;
 explanationStatus: "question-bank" | "ai-generated-unverified" | "template";
 answerKeyVerified: boolean;
 explanationVerified: boolean;
 learningDecision: { action: "learn-concept" | "review-topic" | "spaced-practice"; title: string; reason: string; recommendedMode: "practice" | "mistakes"; questionCount: number };
};
export type PracticeResult = { attemptId: number; score: number; incorrect: number; unanswered: number; total: number; breakdown: { subject: string; correct: number; incorrect: number; unanswered: number; total: number }[]; questions: { questionId: number; text: string; options: string[]; selectedIndex: number | null; correctIndex: number; isCorrect: boolean; explanation: string }[] };
type Props = { result: PracticeResult; onBack: () => void; onExplain: (questionId: number) => Promise<AnswerExplanation> };
export default function StudentPracticeResults({ result, onBack, onExplain }: Props) {
 const [expanded, setExpanded] = useState<Record<number, AnswerExplanation>>({});
 const [loading, setLoading] = useState<number | null>(null);
 const [errors, setErrors] = useState<Record<number,string>>({});
 async function explain(questionId:number) {
  setLoading(questionId); setErrors((current)=>({...current,[questionId]:""}));
  try { const response=await onExplain(questionId); setExpanded((current)=>({...current,[questionId]:response})); }
  catch(error) { setErrors((current)=>({...current,[questionId]:error instanceof Error?error.message:"Could not generate explanation."})); }
  finally { setLoading(null); }
 }
 return <section><div className="page-heading"><div><p className="eyebrow">SESSION COMPLETE</p><h1>Your result</h1></div><button className="ghost" onClick={onBack}>Back to dashboard</button></div>
 <div className="panel score-panel"><strong>{result.score} / {result.total}</strong><span className="muted">Your score</span><p>{result.incorrect} incorrect · {result.unanswered} unanswered</p></div>
 <div className="grid two">{result.breakdown.map((item) => <article className="panel" key={item.subject}><h3>{item.subject}</h3><p>{item.correct} correct · {item.incorrect} incorrect · {item.unanswered} unanswered</p></article>)}</div>
 <h2 className="section-heading">Answer review</h2>{result.questions.map((question,index)=>{
  const detail=expanded[question.questionId];
  return <article className="panel question-card answer-review-card" key={question.questionId}><p className="eyebrow">QUESTION {index+1}</p><h3>{question.text}</h3>
  <p className={question.selectedIndex===null?"muted":question.isCorrect?"success":"error"}>{question.selectedIndex===null?"Not answered":question.isCorrect?"Correct":"Incorrect"}</p>
  <p><strong>Your answer:</strong> {question.selectedIndex===null?"Not answered":question.options[question.selectedIndex]}</p><p><strong>Correct answer:</strong> {question.options[question.correctIndex]}</p>
  {question.explanation && <p className="muted">{question.explanation}</p>}
  <div className="answer-intelligence-actions"><button type="button" className="button button-secondary" disabled={loading!==null} onClick={()=>void explain(question.questionId)}>{loading===question.questionId?"Building explanation…":detail?"Regenerate explanation":"Explain this answer with AI"}</button><span className="muted">Uses stored question-bank content first, then configured AI fallbacks.</span></div>
  {errors[question.questionId] && <p className="error" role="alert">{errors[question.questionId]}</p>}
  {detail && <section className="answer-intelligence-panel" aria-live="polite">
   <div className="answer-intelligence-heading"><div><p className="eyebrow">ARCTESTER ANSWER INTELLIGENCE</p><h4>{detail.summary}</h4></div><span className={"status "+(detail.explanationStatus==="question-bank"?"status-used":"status-pending")}>{detail.explanationStatus==="question-bank"?"QUESTION BANK":detail.explanationStatus==="template"?"OFFLINE GUIDE":"AI DRAFT"}</span></div>
   <h5>Step-by-step reasoning</h5><ol>{detail.reasoning.map((step,i)=><li key={i}>{step}</li>)}</ol>
   <h5>Option analysis</h5><div className="answer-option-analysis">{detail.optionAnalysis.map((option,i)=><div key={i} className={option.isCorrect?"answer-option-correct":"answer-option-other"}><strong>{String.fromCharCode(65+i)}. {option.option}</strong><p>{option.explanation}</p></div>)}</div>
   {detail.misconception && <p className="answer-misconception"><strong>Possible misconception:</strong> {detail.misconception}</p>}
   <p className="answer-takeaway"><strong>Remember:</strong> {detail.takeaway}</p>
   <div className="answer-learning-decision"><p className="eyebrow">NEXT STEP · DECISION ENGINE</p><strong>{detail.learningDecision.title}</strong><p>{detail.learningDecision.reason}</p><small>Suggested {detail.learningDecision.questionCount}-question {detail.learningDecision.recommendedMode} set · Based on this answer only</small></div>
   <small className="muted">Answer key: {detail.answerKeyVerified?"from saved question snapshot":"not verified"} · Explanation: {detail.explanationVerified?"reviewed":"not independently verified"} · Source: {detail.provider}</small>
  </section>}
  </article>;
 })}</section>;
}
