export type PracticeResult = { attemptId: number; score: number; incorrect: number; unanswered: number; total: number; breakdown: { subject: string; correct: number; incorrect: number; unanswered: number; total: number }[]; questions: { questionId: number; text: string; options: string[]; selectedIndex: number | null; correctIndex: number; isCorrect: boolean; explanation: string }[] };
type Props = { result: PracticeResult; onBack: () => void };
export default function StudentPracticeResults({ result, onBack }: Props) {
 return <section><div className="page-heading"><div><p className="eyebrow">SESSION COMPLETE</p><h1>Your result</h1></div><button className="ghost" onClick={onBack}>Back to dashboard</button></div>
 <div className="panel score-panel"><strong>{result.score} / {result.total}</strong><span className="muted">Your score</span><p>{result.incorrect} incorrect · {result.unanswered} unanswered</p></div>
 <div className="grid two">{result.breakdown.map((item) => <article className="panel" key={item.subject}><h3>{item.subject}</h3><p>{item.correct} correct · {item.incorrect} incorrect · {item.unanswered} unanswered</p></article>)}</div>
 <h2 className="section-heading">Answer review</h2>{result.questions.map((question,index)=><article className="panel question-card" key={question.questionId}><p className="eyebrow">QUESTION {index+1}</p><h3>{question.text}</h3>
 <p className={question.selectedIndex===null?"muted":question.isCorrect?"success":"error"}>{question.selectedIndex===null?"Not answered":question.isCorrect?"Correct":"Incorrect"}</p>
 <p><strong>Your answer:</strong> {question.selectedIndex===null?"Not answered":question.options[question.selectedIndex]}</p><p><strong>Correct answer:</strong> {question.options[question.correctIndex]}</p><p className="muted">{question.explanation}</p></article>)}</section>;
}
