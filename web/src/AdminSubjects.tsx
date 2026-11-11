import {
  AP_ECET_2026_BLUEPRINT_TOTAL,
  AP_ECET_2026_CSE_BLUEPRINT,
  countBlueprintQuestions,
} from "./apEcetBlueprint";

export type AdminCatalogSubject = {
  id: number;
  name: string;
  count: number;
  topics: { id: number; name: string; _count: { questions: number } }[];
};

type AdminSubjectsProps = { catalog: AdminCatalogSubject[]; onRefresh: () => void };

export default function AdminSubjects({ catalog, onRefresh }: AdminSubjectsProps) {
  const blueprintRows = AP_ECET_2026_CSE_BLUEPRINT.map((subject) => ({
    ...subject,
    questionCount: countBlueprintQuestions(catalog, subject.aliases),
  }));
  const currentBlueprintQuestions = blueprintRows.reduce((total, subject) => total + subject.questionCount, 0);
  const sections = ["Common", "CSE"] as const;

  return (
    <>
      <div className="admin-page-title">
        <div>
          <p className="eyebrow">SYLLABUS ORGANISATION</p>
          <h1>Subjects &amp; topics</h1>
          <p>Subject and topic structure is created automatically as questions are imported.</p>
        </div>
        <button className="ghost" onClick={onRefresh}>Refresh catalog</button>
      </div>

      <section className="admin-panel" aria-labelledby="blueprint-coverage-heading">
        <div className="admin-panel-head">
          <div>
            <p className="eyebrow">AP ECET 2026 · ENGINEERING / CSE</p>
            <h2 id="blueprint-coverage-heading">Question-bank coverage vs blueprint</h2>
            <p>Question counts are compared with the published target. Known legacy subject names are grouped under their official blueprint unit.</p>
          </div>
          <a
            href="https://cets.apsche.ap.gov.in/ECET/PDF/Diploma%20Holders%20in%20Engineering/APECET2026_COMPUTER_SCIENCE_AND_ENGINEERING.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Official CSE syllabus
          </a>
        </div>
        <p className="muted">
          {currentBlueprintQuestions} / {AP_ECET_2026_BLUEPRINT_TOTAL} blueprint questions currently in the bank
        </p>
        {sections.map((section) => (
          <div key={section}>
            <h3>{section === "Common" ? "Common subjects" : "CSE engineering paper"}</h3>
            <div className="subject-admin-grid">
              {blueprintRows.filter((subject) => subject.section === section).map((subject) => {
                const remaining = Math.max(0, subject.targetQuestions - subject.questionCount);
                const percentage = Math.min(100, Math.round((subject.questionCount / subject.targetQuestions) * 100));
                return (
                  <article className="admin-panel" key={subject.name}>
                    <div className="subject-admin-head">
                      <div>
                        <h4>{subject.name}</h4>
                        <small>{subject.questionCount} / {subject.targetQuestions} questions</small>
                      </div>
                      <span>{remaining > 0 ? `${remaining} needed` : subject.questionCount === subject.targetQuestions ? "Target met" : `${subject.questionCount - subject.targetQuestions} above target`}</span>
                    </div>
                    <progress
                      aria-label={`${subject.name} blueprint coverage`}
                      value={percentage}
                      max={100}
                    />
                  </article>
                );
              })}
            </div>
          </div>
        ))}
        <p className="muted">Targets follow the AP ECET 2026 instruction booklet and CSE syllabus. Coverage is a bank-count comparison, not a quality or answer-verification measure.</p>
      </section>

      <div className="subject-admin-grid">
        {catalog.map((subject) => (
          <article className="admin-panel" key={subject.id}>
            <div className="subject-admin-head">
              <div><h2>{subject.name}</h2><small>{subject.count} questions</small></div>
              <span>{subject.topics.length} topics</span>
            </div>
            {subject.topics.map((topic) => (
              <div className="topic-row" key={topic.id}>
                {topic.name}<span>{topic._count.questions} questions</span>
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  );
}
