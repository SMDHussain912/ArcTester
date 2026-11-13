export type AssignedExamSubmission = {
  id: string;
  status: string;
  score: number | null;
  maximumScore: number | null;
  submittedAt: string;
};

export type AssignedExamQuestion = {
  id: string;
  position: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
  marks: number;
  negativeMarks: number;
  optionOrder: number[];
};

export type AssignedExamPackage = {
  assignmentId: string;
  title: string;
  version: number;
  instructions: string;
  durationMinutes: number;
  integrityLevel: string;
  dueAt: string | null;
  questions: AssignedExamQuestion[];
};

export type AssignedExamResultQuestion = {
  id: string;
  position: number;
  text: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | null;
  isCorrect: boolean;
  awardedMarks: number;
  explanation: string;
};

export type AssignedExamResult = {
  status: string;
  score: number | null;
  maximumScore: number | null;
  questions: AssignedExamResultQuestion[];
};

export type AssignedExam = {
  id: string;
  status: string;
  assignedAt: string;
  availableFrom: string | null;
  dueAt: string | null;
  exam: { id: string; title: string; description: string };
  version: number;
  durationMinutes: number;
  questionCount: number;
  submission: AssignedExamSubmission | null;
};