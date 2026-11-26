type PracticeDifficulty = "any" | "easy" | "medium" | "hard";
type PracticeQuestionType = "mcq" | "multi_select" | "true_false" | "fill_blank" | "numeric" | "matching";
interface StudentPracticePaperConfigurationProps {
  selectedSubjects: string[];
  questionCount: number;
  difficulty: PracticeDifficulty;
  durationMinutes?: number;
  onDurationChange?: (minutes: number) => void;
  questionTypes?: PracticeQuestionType[];
  onQuestionTypesChange?: (types: PracticeQuestionType[]) => void;
  onQuestionCountChange: (count: number) => void;
  onDifficultyChange: (difficulty: PracticeDifficulty) => void;
}
export default function StudentPracticePaperConfiguration({ selectedSubjects, questionCount, difficulty, durationMinutes = 20, questionTypes = [], onDurationChange = () => undefined, onQuestionTypesChange = () => undefined, onQuestionCountChange, onDifficultyChange }: StudentPracticePaperConfigurationProps) {
  return (
    <div className="practice-builder-section">
      <strong>3. Configure your paper</strong>
      <div className="practice-config-grid">
        <label>Number of questions<input type="number" min={1} max={200} value={questionCount} onChange={(event) => onQuestionCountChange(Math.max(1, Math.min(200, Math.floor(Number(event.target.value) || 1))))} /></label>
        <label>Difficulty<select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value as PracticeDifficulty)}><option value="any">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
        <label>Time limit<select value={durationMinutes} onChange={(event) => onDurationChange(Number(event.target.value))}>{[5,10,15,20,30,45,60,90,120,180].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
      </div>
      <label>Question types <span className="muted">{questionTypes.length ? questionTypes.length + " selected" : "All types"}</span></label>
      <div className="practice-question-type-options">{([{value:"mcq",label:"Multiple choice"},{value:"multi_select",label:"Multi-select"},{value:"true_false",label:"True / false"},{value:"fill_blank",label:"Fill blank"},{value:"numeric",label:"Numeric"},{value:"matching",label:"Matching"}] as const).map((item) => <label key={item.value}><input type="checkbox" checked={questionTypes.includes(item.value)} onChange={(event) => onQuestionTypesChange(event.target.checked ? [...questionTypes, item.value] : questionTypes.filter((value) => value !== item.value))} />{item.label}</label>)}</div>
      <button type="button" className="text-button" onClick={() => onQuestionTypesChange([])}>Use all question types</button>
      <p className="practice-helper">Questions are distributed across selected subjects. Adaptive selection also prioritizes weak topics, overdue review and suitable difficulty using your completed practice history. It never uses unfinished attempts.</p>
      {selectedSubjects.length > 0 && <div className="practice-quota-preview"><span className="practice-helper">Requested subject distribution</span><div>{selectedSubjects.map((subject, index) => { const base = Math.floor(questionCount / selectedSubjects.length); const quota = base + (index < questionCount % selectedSubjects.length ? 1 : 0); return <span key={subject}><strong>{subject}</strong><b>{quota}</b></span>; })}</div></div>}
    </div>
  );
}
