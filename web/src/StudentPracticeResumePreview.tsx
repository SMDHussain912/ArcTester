interface StudentPracticeResumePreviewProps {
  answeredCount: number;
  totalQuestions: number;
  onResume: () => void;
}

export default function StudentPracticeResumePreview({
  answeredCount,
  totalQuestions,
  onResume,
}: StudentPracticeResumePreviewProps) {
  return (
    <section className="panel student-notice-preview" aria-labelledby="practice-resume-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">PRACTICE IN PROGRESS</p>
          <h2 id="practice-resume-title">Resume your practice session</h2>
          <p className="muted">{answeredCount} of {totalQuestions} questions answered. Your selections are saved in this browser.</p>
        </div>
        <button type="button" className="primary" onClick={onResume}>Continue practice</button>
      </div>
    </section>
  );
}
