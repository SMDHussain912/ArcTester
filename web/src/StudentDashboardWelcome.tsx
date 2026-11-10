import type { StudentPage } from "./StudentNavigation";

interface StudentDashboardWelcomeProps {
  visible: boolean;
  onNavigate: (page: StudentPage) => void;
}

export default function StudentDashboardWelcome({ visible, onNavigate }: StudentDashboardWelcomeProps) {
  return (
    <section hidden={!visible} className="student-home-hero" id="dashboard" aria-labelledby="student-home-title">
      <div className="student-home-copy">
        <p className="eyebrow">YOUR LEARNING DASHBOARD</p>
        <h1 id="student-home-title">Make every practice count.</h1>
        <p>Build your skills with focused practice, keep track of assigned examinations, and use your progress to decide what to study next.</p>
        <div className="student-home-actions">
          <button type="button" className="primary" onClick={() => onNavigate("practice")}>Start practicing <span aria-hidden="true">→</span></button>
          <button type="button" className="student-home-secondary" onClick={() => onNavigate("assigned-exams")}>View assigned exams</button>
        </div>
      </div>
      <div className="student-home-mark" aria-hidden="true">
        <span>A</span>
        <small>LEARN · PRACTICE · IMPROVE</small>
      </div>
    </section>
  );
}
