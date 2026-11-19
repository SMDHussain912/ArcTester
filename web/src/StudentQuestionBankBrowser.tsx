import { useMemo, useState } from "react";

type QuestionBankSubject = { subject: string; count: number };

interface StudentQuestionBankBrowserProps {
  subjects: QuestionBankSubject[];
  visible: boolean;
  disabled: boolean;
  onChooseSubject: (subject: string) => void;
}

export default function StudentQuestionBankBrowser({
  subjects,
  visible,
  disabled,
  onChooseSubject,
}: StudentQuestionBankBrowserProps) {
  const [query, setQuery] = useState("");
  const filteredSubjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return subjects;
    return subjects.filter((item) => item.subject.toLocaleLowerCase().includes(normalized));
  }, [query, subjects]);
  const totalQuestions = subjects.reduce((total, item) => total + item.count, 0);

  return (
    <section hidden={!visible} aria-labelledby="question-bank-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">QUESTION BANK</p>
          <h2 id="question-bank-title">Practice by subject</h2>
          <p className="muted">{subjects.length} subjects · {totalQuestions.toLocaleString()} questions available</p>
        </div>
      </div>
      <label className="question-bank-search">
        <span>Search subjects</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a subject…"
          aria-label="Search question bank subjects"
          disabled={disabled && subjects.length === 0}
        />
        {query ? <button type="button" className="ghost" onClick={() => setQuery("")} aria-label="Clear subject search">Clear</button> : null}
      </label>
      {filteredSubjects.length ? (
        <div className="grid two">
          {filteredSubjects.map((item) => (
            <button
              type="button"
              className="panel subject-card"
              key={item.subject}
              disabled={disabled}
              onClick={() => onChooseSubject(item.subject)}
              aria-label={`${item.subject}, ${item.count} questions`}
            >
              <span>
                <strong>{item.subject}</strong>
                <small>{item.count.toLocaleString()} questions</small>
              </span>
              <b aria-hidden="true">→</b>
            </button>
          ))}
        </div>
      ) : subjects.length ? (
        <div className="panel question-bank-empty" role="status">
          <strong>No subjects match “{query.trim()}”</strong>
          <p className="muted">Try another subject name or clear your search.</p>
          <button type="button" className="ghost" onClick={() => setQuery("")}>Clear search</button>
        </div>
      ) : (
        <div className="panel question-bank-empty" role="status">
          <strong>No question bank available yet</strong>
          <p className="muted">Your administrator has not published any subjects with practice questions.</p>
        </div>
      )}
    </section>
  );
}
