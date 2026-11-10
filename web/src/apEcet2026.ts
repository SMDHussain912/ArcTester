export type PaperQuestionCandidate = { id: number; subject: string; difficulty: string };
export type PaperDifficultyMix = { easy: number; medium: number; hard: number };
export type PaperShortfall = { subject: string; requested: number; available: number };
export type PaperSelection = { ids: number[]; shortfalls: PaperShortfall[] };

/** Official APECET 2026 CSE distribution from APSCHE Annexure-II: 100 common + 100 branch questions. Source: https://cets.apsche.ap.gov.in/ECET/PDF/Diploma%20Holders%20in%20Engineering/APECET2026_COMPUTER_SCIENCE_AND_ENGINEERING.pdf */
export const AP_ECET_CSE_2026_QUOTAS: Readonly<Record<string, number>> = {
  Mathematics: 50,
  Physics: 25,
  Chemistry: 25,
  "Digital Electronics": 6,
  "Software Engineering": 6,
  "Computer Organisation and Microprocessors": 8,
  "Data Structures through C": 10,
  "Computer Networks": 6,
  "Operating Systems": 10,
  DBMS: 8,
  "Java Programming": 10,
  "Web Technologies": 8,
  "Big-data & Cloud Computing": 6,
  "Android Programming": 6,
  "Internet Of Things(IoT)": 8,
  "Python Programming": 8,
};

const SUBJECT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Mathematics: ["Maths"],
  "Computer Organisation and Microprocessors": ["Computer Organisation", "Computer Organization", "Computer Organization and Microprocessors"],
  "Data Structures through C": ["Data Structures"],
  "Computer Networks": ["Computer Networks & Cyber Security"],
  "Java Programming": ["Java"],
  "Big-data & Cloud Computing": ["Big Data & Cloud", "Big Data & Cloud Computing", "Bid-data & Cloud Computing"],
  "Android Programming": ["Android"],
  "Internet Of Things(IoT)": ["IoT", "Internet of Things", "Internet of Things (IoT)"],
  "Python Programming": ["Python"],
};

export function normalizePaperSubject(subject: string): string {
  return subject.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

export function canonicalPaperSubject(subject: string): string {
  const normalized = normalizePaperSubject(subject);
  for (const [canonical, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if ([canonical, ...aliases].some((name) => normalizePaperSubject(name) === normalized)) return canonical;
  }
  return subject.trim();
}

export function paperSubjectAliases(subject: string): string[] {
  const canonical = canonicalPaperSubject(subject);
  return [canonical, ...(SUBJECT_ALIASES[canonical] ?? [])];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/**
 * Select questions in canonical subject order. Aliased labels are pooled into
 * one syllabus unit; deterministic seeds make paper composition reproducible.
 * Any quota shortfall is returned to the caller instead of being hidden.
 */
export function selectPaperQuestions(
  candidates: readonly PaperQuestionCandidate[],
  requestedQuotas: Readonly<Record<string, number>>,
  defaultPerSubject: number,
  difficultyMix: PaperDifficultyMix,
  seed = 42,
  includeUnspecifiedSubjects = true,
): PaperSelection {
  const quotaBySubject = new Map<string, number>();
  for (const [subject, quota] of Object.entries(requestedQuotas)) quotaBySubject.set(canonicalPaperSubject(subject), Math.max(0, Math.floor(quota)));
  const subjects = includeUnspecifiedSubjects
    ? [...new Set([...candidates.map((question) => canonicalPaperSubject(question.subject)), ...quotaBySubject.keys()])]
    : [...quotaBySubject.keys()];
  const random = seededRandom(seed);
  const ids: number[] = [];
  const shortfalls: PaperShortfall[] = [];
  const mixTotal = Math.max(0, difficultyMix.easy) + Math.max(0, difficultyMix.medium) + Math.max(0, difficultyMix.hard);

  for (const subject of subjects) {
    const aliases = new Set(paperSubjectAliases(subject).map(normalizePaperSubject));
    const pool = candidates.filter((question) => aliases.has(normalizePaperSubject(question.subject)));
    const requested = quotaBySubject.get(subject) ?? Math.max(0, Math.floor(defaultPerSubject));
    if (pool.length < requested) shortfalls.push({ subject, requested, available: pool.length });
    const count = Math.min(requested, pool.length);
    if (count === 0) continue;
    const selected: PaperQuestionCandidate[] = [];
    const selectedIds = new Set<number>();
    for (const level of ["easy", "medium", "hard"] as const) {
      const percentage = Math.max(0, difficultyMix[level]);
      const target = mixTotal > 0 ? Math.floor(count * percentage / mixTotal) : 0;
      const available = shuffle(pool.filter((question) => question.difficulty === level && !selectedIds.has(question.id)), random);
      for (const question of available.slice(0, target)) { selected.push(question); selectedIds.add(question.id); }
    }
    const remainder = shuffle(pool.filter((question) => !selectedIds.has(question.id)), random);
    for (const question of remainder.slice(0, Math.max(0, count - selected.length))) { selected.push(question); selectedIds.add(question.id); }
    ids.push(...selected.map((question) => question.id));
  }

  return { ids, shortfalls };
}
