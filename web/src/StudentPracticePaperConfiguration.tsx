type PracticeDifficulty = "any" | "easy" | "medium" | "hard";
interface StudentPracticePaperConfigurationProps {
  selectedSubjects: string[];
  questionCount: number;
  difficulty: PracticeDifficulty;
  onQuestionCountChange: (count: number) => void;
  onDifficultyChange: (difficulty: PracticeDifficulty) => void;
}
export default function StudentPracticePaperConfiguration({ selectedSubjects, questionCount, difficulty, onQuestionCountChange, onDifficultyChange }: StudentPracticePaperConfigurationProps) {
  return (
    <div className="practice-builder-section">
      <strong>3. Configure your paper</strong>
      <div className="practice-config-grid">
        <label>Number of questions<input type="number" min={1} max={200} value={questionCount} onChange={(event) => onQuestionCountChange(Math.max(1, Math.min(200, Math.floor(Number(event.target.value) || 1))))} /></label>
        <label>Difficulty<select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value as PracticeDifficulty)}><option value="any">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
      </div>
      <p className="practice-helper">Questions are distributed as evenly as possible across selected subjects. If a subject has too few matching questions, ArcTester will tell you.</p>
      {selectedSubjects.length > 0 && <div className="practice-quota-preview"><span className="practice-helper">Requested subject distribution</span><div>{selectedSubjects.map((subject, index) => { const base = Math.floor(questionCount / selectedSubjects.length); const quota = base + (index < questionCount % selectedSubjects.length ? 1 : 0); return <span key={subject}><strong>{subject}</strong><b>{quota}</b></span>; })}</div></div>}
    </div>
  );
}
