import type { ReactNode } from "react";

function AboutSection({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <section className="panel about-section">
      <div className="about-section-heading"><span className="about-eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {children}
    </section>
  );
}

export default function StudentAbout() {
  return (
    <div className="stack about-page">
      <header className="about-hero">
        <div className="about-hero-copy">
          <p className="eyebrow">ABOUT & CONTACT</p>
          <h1>Built to make exam preparation clearer.</h1>
          <p>ArcTester is a student-focused exam preparation platform designed to turn practice into measurable progress.</p>
        </div>
        <div className="about-brand-mark" aria-hidden="true"><span>AT</span><small>ARCTESTER</small></div>
      </header>

      <div className="about-grid">
        <AboutSection title="About ArcTester" eyebrow="THE PLATFORM">
          <p>ArcTester is an exam preparation and practice platform built with a mobile-first approach. It brings question practice, exam attempts, results and performance insights into one workspace.</p>
          <ul className="about-feature-list">
            <li><strong>Practice exams</strong><span>Create focused question papers and review your attempts.</span></li>
            <li><strong>Mock and assigned exams</strong><span>Work through exam-style assessments and track submitted results.</span></li>
            <li><strong>Performance analytics</strong><span>Understand accuracy, answer patterns and progress across attempts.</span></li>
            <li><strong>Offline question bank</strong><span>Keep a portable practice bank available for study away from the network.</span></li>
          </ul>
        </AboutSection>

        <AboutSection title="About me" eyebrow="THE BUILDER">
          <div className="about-developer">
            <div className="about-developer-avatar" aria-hidden="true">A</div>
            <div><h3>Arc</h3><p className="about-role">Student developer · Full-stack programmer</p></div>
          </div>
          <p>Arc is an engineering student and developer interested in building useful software, web and mobile applications, game systems and applied AI.</p>
          <p>ArcTester is an independent project created to make exam preparation more organized, accessible and data-informed.</p>
        </AboutSection>
      </div>

      <AboutSection title="Project overview" eyebrow="PRODUCT & ENGINEERING">
        <div className="about-project-grid">
          <div><span>PRODUCT</span><strong>ArcTester</strong><p>Student exam preparation and analytics</p></div>
          <div><span>EXPERIENCE</span><strong>Mobile-first</strong><p>Web and mobile learning workflow</p></div>
          <div><span>FOCUS</span><strong>Practice → Insight</strong><p>Practice, review and improve</p></div>
        </div>
        <p className="about-project-note">ArcTester is actively developed. Some learning modules and advanced features may be marked as coming soon until they are released.</p><a className="about-repository-link" href="https://github.com/smdgamekingindo-TN/ArcTester" target="_blank" rel="noreferrer">View the ArcTester project on GitHub <span aria-hidden="true">↗</span></a>
      </AboutSection>

      <AboutSection title="Contact" eyebrow="GET IN TOUCH">
        <p>For project feedback, collaboration or support, use the contact details below.</p>
        <div className="about-contact-list">
          <a href="mailto:smdgameking@gmail.com" className="about-contact-item"><span className="about-contact-icon" aria-hidden="true">✉</span><span><small>EMAIL</small><strong>smdgameking@gmail.com</strong></span><span aria-hidden="true">↗</span></a>
          <a href="tel:+917674933732" className="about-contact-item"><span className="about-contact-icon" aria-hidden="true">☎</span><span><small>MOBILE</small><strong>+91 76749 33732</strong></span><span aria-hidden="true">↗</span></a>
        </div>
      </AboutSection>

      <footer className="about-footer">ArcTester · Built for focused preparation and steady progress.</footer>
    </div>
  );
}
