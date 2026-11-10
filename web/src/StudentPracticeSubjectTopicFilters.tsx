type PracticeSubject = {
  subject: string;
  count: number;
  topics?: { topic: string; count: number }[];
};

interface StudentPracticeSubjectTopicFiltersProps {
  subjects: PracticeSubject[];
  showEmptyMessage: boolean;
  selectedSubjects: string[];
  selectedTopicKeys: string[];
  onSubjectsChange: (subjects: string[] | ((current: string[]) => string[])) => void;
  onTopicKeysChange: (keys: string[] | ((current: string[]) => string[])) => void;
  onError: (message: string) => void;
}

export default function StudentPracticeSubjectTopicFilters({
  subjects, showEmptyMessage, selectedSubjects, selectedTopicKeys,
  onSubjectsChange, onTopicKeysChange, onError,
}: StudentPracticeSubjectTopicFiltersProps) {
  function toggleSubject(subject: string, checked: boolean) {
    if (checked && selectedSubjects.length >= 30) {
      onError("You can select up to 30 subjects in one practice paper.");
      return;
    }
    onError("");
    onSubjectsChange((current) => checked ? [...current, subject] : current.filter((name) => name !== subject));
    if (!checked) onTopicKeysChange((current) => current.filter((key) => {
      try { return (JSON.parse(key) as [string, string])[0] !== subject; } catch { return false; }
    }));
  }
  return (
    <>
      <div className="practice-builder-section">
        <div className="practice-builder-label"><strong>1. Select subjects</strong><span className="muted">{selectedSubjects.length} selected</span></div>
        <div className="practice-subject-grid">
          {subjects.map((item) => <label className={selectedSubjects.includes(item.subject) ? "practice-subject-choice selected" : "practice-subject-choice"} key={item.subject}>
            <input type="checkbox" checked={selectedSubjects.includes(item.subject)} onChange={(event) => toggleSubject(item.subject, event.target.checked)} />
            <span><strong>{item.subject}</strong><small>{item.count} questions available</small></span>
          </label>)}
        </div>
        {showEmptyMessage && <p className="muted">No subjects are available in the question bank yet.</p>}
        <div className="practice-builder-actions">
          <button type="button" className="text-button" disabled={!subjects.length} onClick={() => { onSubjectsChange(subjects.map((item) => item.subject).slice(0, 30)); onError(subjects.length > 30 ? "Only the first 30 subjects were selected. The API supports up to 30 subjects per paper." : ""); }}>Select all subjects</button>
          <button type="button" className="text-button" disabled={!selectedSubjects.length} onClick={() => { onSubjectsChange([]); onTopicKeysChange([]); }}>Clear selection</button>
        </div>
      </div>
      <div className="practice-builder-section">
        <div className="practice-builder-label"><strong>2. Choose topics <span className="muted">(optional)</span></strong><span className="muted">{selectedTopicKeys.length ? String(selectedTopicKeys.length) + " selected" : "All topics"}</span></div>
        {selectedSubjects.length === 0 ? <p className="practice-helper">Select at least one subject to see its topics.</p> : <div className="practice-topic-groups">{selectedSubjects.map((subject) => {
          const item = subjects.find((entry) => entry.subject === subject);
          if (!item?.topics?.length) return <div className="practice-topic-group" key={subject}><strong>{subject}</strong><p className="muted">No topics are defined. All questions in this subject remain eligible.</p></div>;
          return <div className="practice-topic-group" key={subject}><strong>{subject}</strong><div className="practice-topic-list">{item.topics.map((topic) => {
            const key = JSON.stringify([subject, topic.topic]);
            return <label key={key}><input type="checkbox" checked={selectedTopicKeys.includes(key)} onChange={(event) => onTopicKeysChange((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} />{topic.topic}<small>{topic.count}</small></label>;
          })}</div></div>;
        })}</div>}
        <p className="practice-helper">Leave all topics unchecked to include every topic in your selected subjects. For each subject, leave its topics unchecked to include all topics; selecting topics restricts only that subject.</p>
        {selectedTopicKeys.length > 0 && <button type="button" className="text-button" onClick={() => onTopicKeysChange([])}>Clear topic filters</button>}
      </div>
    </>
  );
}
