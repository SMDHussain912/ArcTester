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
  return (
    <section hidden={!visible}>
      <div className="section-head">
        <div>
          <p className="eyebrow">QUESTION BANK</p>
          <h2>Practice by subject</h2>
        </div>
      </div>
      <div className="grid two">
        {subjects.map((item) => (
          <button
            className="panel subject-card"
            key={item.subject}
            disabled={disabled}
            onClick={() => onChooseSubject(item.subject)}
          >
            <span>
              <strong>{item.subject}</strong>
              <small>{item.count} questions</small>
            </span>
            <b>→</b>
          </button>
        ))}
      </div>
    </section>
  );
}
