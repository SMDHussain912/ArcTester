export type ApEcetBlueprintSection = "Common" | "CSE";

export type ApEcetBlueprintSubject = {
  name: string;
  section: ApEcetBlueprintSection;
  targetQuestions: number;
  aliases: readonly string[];
};

/**
 * AP ECET 2026 engineering-stream blueprint:
 * common subjects (50 + 25 + 25) and the CSE paper's 13 unit allocations (100).
 * Aliases account for legacy question-bank labels; matching is case-insensitive.
 */
export const AP_ECET_2026_CSE_BLUEPRINT: readonly ApEcetBlueprintSubject[] = [
  { name: "Mathematics", section: "Common", targetQuestions: 50, aliases: ["Mathematics", "Maths", "Math"] },
  { name: "Physics", section: "Common", targetQuestions: 25, aliases: ["Physics"] },
  { name: "Chemistry", section: "Common", targetQuestions: 25, aliases: ["Chemistry"] },
  { name: "Digital Electronics", section: "CSE", targetQuestions: 6, aliases: ["Digital Electronics"] },
  { name: "Software Engineering", section: "CSE", targetQuestions: 6, aliases: ["Software Engineering"] },
  {
    name: "Computer Organization and Microprocessors",
    section: "CSE",
    targetQuestions: 8,
    aliases: ["Computer Organization and Microprocessors", "Computer Organisation and Microprocessors", "Computer Organisation", "Computer Organization", "Microprocessors"],
  },
  {
    name: "Data Structures through C",
    section: "CSE",
    targetQuestions: 10,
    aliases: ["Data Structures through C", "Data Structures", "C and Data Structures"],
  },
  {
    name: "Computer Networks",
    section: "CSE",
    targetQuestions: 6,
    aliases: ["Computer Networks", "Computer Networks & Cyber Security", "Computer Networks and Cyber Security", "Networks"],
  },
  { name: "Operating Systems", section: "CSE", targetQuestions: 10, aliases: ["Operating Systems", "Operating System", "OS"] },
  { name: "DBMS", section: "CSE", targetQuestions: 8, aliases: ["DBMS", "RDBMS", "Database Management Systems"] },
  { name: "Java Programming", section: "CSE", targetQuestions: 10, aliases: ["Java Programming", "Java"] },
  { name: "Web Technologies", section: "CSE", targetQuestions: 8, aliases: ["Web Technologies", "Web Technology", "Internet Programming"] },
  {
    name: "Big Data & Cloud Computing",
    section: "CSE",
    targetQuestions: 6,
    aliases: ["Big Data & Cloud Computing", "Big-data & Cloud Computing", "Big Data & Cloud", "Big Data and Cloud Computing"],
  },
  { name: "Android Programming", section: "CSE", targetQuestions: 6, aliases: ["Android Programming", "Android"] },
  {
    name: "Internet of Things (IoT)",
    section: "CSE",
    targetQuestions: 8,
    aliases: ["Internet of Things (IoT)", "Internet Of Things(IoT)", "Internet Of Things(IoT", "IoT"],
  },
  { name: "Python Programming", section: "CSE", targetQuestions: 8, aliases: ["Python Programming", "Python"] },
] as const;

export const AP_ECET_2026_BLUEPRINT_TOTAL = AP_ECET_2026_CSE_BLUEPRINT.reduce(
  (total, subject) => total + subject.targetQuestions,
  0,
);

export function normalizeBlueprintSubjectName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function countBlueprintQuestions(
  catalog: readonly { name: string; count: number }[],
  aliases: readonly string[],
): number {
  const acceptedNames = new Set(aliases.map(normalizeBlueprintSubjectName));
  return catalog.reduce(
    (total, subject) => total + (acceptedNames.has(normalizeBlueprintSubjectName(subject.name)) ? subject.count : 0),
    0,
  );
}
