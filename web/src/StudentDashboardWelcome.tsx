interface StudentDashboardWelcomeProps {
  visible: boolean;
}

export default function StudentDashboardWelcome({ visible }: StudentDashboardWelcomeProps) {
  return (
    <section hidden={!visible} className="welcome panel" id="dashboard">
      <div>
        <p className="eyebrow">YOUR LEARNING DASHBOARD</p>
        <h1>Make every practice count.</h1>
        <p className="muted">
          Pick a subject or start a mixed session. Your progress is saved to your account.
        </p>
      </div>
      <div className="welcome-mark">A</div>
    </section>
  );
}
