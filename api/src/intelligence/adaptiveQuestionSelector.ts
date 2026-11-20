export type AdaptiveReasonCode = "WEAK_TOPIC" | "SPACED_REVIEW" | "DIFFICULTY_FIT" | "NOVELTY" | "MIXED_PRACTICE";
export interface AdaptiveTopicState {
  subject: string; topic: string; accuracy: number | null; answered: number;
  exposureCount: number; lastSeenAt?: string | null; uncertainty?: number;
}
export interface AdaptiveCandidate {
  questionId: string; subject: string; topic: string; difficulty: number;
  exposureCount: number; lastSeenAt?: string | null; discrimination?: number | null;
}
export interface AdaptiveSelectionRequest {
  candidates: AdaptiveCandidate[];
  topicStates: AdaptiveTopicState[];
  questionCount: number;
  now?: string | Date;
  subjects?: string[];
  topic?: string;
  targetDifficulty?: number;
  excludedQuestionIds?: string[];
  recentQuestionIds?: string[];
  explorationBudget?: number;
  policyVersion?: number;
}
export interface AdaptiveSelection {
  rankedQuestionIds: string[];
  scores: number[];
  reasons: Array<{ questionId: string; reasonCode: AdaptiveReasonCode }>;
  policyVersion: number;
  fallbackUsed: boolean;
}
function validDate(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}
export function selectAdaptiveQuestions(request: AdaptiveSelectionRequest): AdaptiveSelection {
  if (!Number.isInteger(request.questionCount) || request.questionCount < 1 || request.questionCount > 100) {
    throw new Error("questionCount must be an integer from 1 to 100");
  }
  const targetDifficulty = request.targetDifficulty ?? 3;
  const explorationBudget = request.explorationBudget ?? 0.1;
  const policyVersion = request.policyVersion ?? 1;
  if (!Number.isFinite(targetDifficulty) || targetDifficulty < 1 || targetDifficulty > 5 ||
    !Number.isFinite(explorationBudget) || explorationBudget < 0 || explorationBudget > 0.3 ||
    !Number.isInteger(policyVersion) || policyVersion < 1) throw new Error("Adaptive policy settings are invalid");
  const now = validDate(request.now ?? new Date());
  if (now === null) throw new Error("Adaptive selection now must be a valid date");
  const excluded = new Set([...(request.excludedQuestionIds ?? []), ...(request.recentQuestionIds ?? [])]);
  const subjects = request.subjects?.length
    ? new Set(request.subjects.map((subject) => subject.trim().toLowerCase()))
    : null;
  const topicState = new Map<string, AdaptiveTopicState>();
  for (const state of request.topicStates) {
    const key = `${state.subject.trim().toLowerCase()}::${state.topic.trim().toLowerCase()}`;
    if (!state.subject.trim() || !state.topic.trim() ||
      (state.accuracy !== null && (!Number.isFinite(state.accuracy) || state.accuracy < 0 || state.accuracy > 1)) ||
      !Number.isInteger(state.answered) || state.answered < 0 ||
      !Number.isInteger(state.exposureCount) || state.exposureCount < 0 ||
      (state.uncertainty !== undefined && (!Number.isFinite(state.uncertainty) || state.uncertainty < 0)) ||
      (state.lastSeenAt != null && validDate(state.lastSeenAt) === null)) {
      throw new Error("Adaptive topic states contain invalid performance metadata");
    }
    if (topicState.has(key)) throw new Error("Adaptive topic states must be unique per subject and topic");
    topicState.set(key, state);
  }
  const unique = new Map<string, AdaptiveCandidate>();
  for (const candidate of request.candidates) {
    if (!candidate.questionId.trim() || !candidate.subject.trim() || !candidate.topic.trim() ||
      !Number.isFinite(candidate.difficulty) || candidate.difficulty < 1 || candidate.difficulty > 5 ||
      !Number.isInteger(candidate.exposureCount) || candidate.exposureCount < 0 ||
      (candidate.discrimination != null && (!Number.isFinite(candidate.discrimination) ||
        candidate.discrimination < 0 || candidate.discrimination > 1)) ||
      (candidate.lastSeenAt != null && validDate(candidate.lastSeenAt) === null)) {
      throw new Error("Adaptive candidates contain invalid metadata");
    }
    if (unique.has(candidate.questionId)) throw new Error("Adaptive candidate question IDs must be unique");
    unique.set(candidate.questionId, candidate);
  }
  const eligible = [...unique.values()].filter((candidate) =>
    !excluded.has(candidate.questionId) &&
    (!subjects || subjects.has(candidate.subject.trim().toLowerCase())) &&
    (!request.topic || candidate.topic.trim().toLowerCase() === request.topic.trim().toLowerCase()));
  const scored = eligible.map((candidate) => {
    const state = topicState.get(`${candidate.subject.toLowerCase()}::${candidate.topic.toLowerCase()}`);
    const daysSinceSeen = validDate(candidate.lastSeenAt) === null ? Infinity :
      Math.max(0, (now - (validDate(candidate.lastSeenAt) as number)) / 86400000);
    const weak = state?.accuracy !== null && state?.accuracy !== undefined && state.accuracy < 0.65 && state.answered >= 5;
    const spaced = (Number.isFinite(daysSinceSeen) && daysSinceSeen >= 7) || (state?.lastSeenAt && validDate(state.lastSeenAt) !== null &&
      (now - (validDate(state.lastSeenAt) as number)) / 86400000 >= 7);
    const difficultyFit = Math.max(0, 1 - Math.abs(candidate.difficulty - targetDifficulty) / 4);
    const novelty = candidate.exposureCount === 0 && !excluded.has(candidate.questionId);
    const topicScore = weak ? (0.65 - (state?.accuracy ?? 0)) * 4 + 1 : 0;
    const spacedScore = spaced ? 1.2 : 0;
    const difficultyScore = difficultyFit * 0.8;
    const noveltyScore = novelty ? 0.8 : Math.max(0, 0.3 - candidate.exposureCount * 0.05);
    const exploration = explorationBudget * (candidate.discrimination == null ? 0.5 : Math.max(0, Math.min(1, candidate.discrimination)));
    const score = topicScore + spacedScore + difficultyScore + noveltyScore + exploration;
    const reasonCode: AdaptiveReasonCode = weak ? "WEAK_TOPIC" :
      spaced ? "SPACED_REVIEW" :
      novelty ? "NOVELTY" :
      Math.abs(candidate.difficulty - targetDifficulty) <= 1 ? "DIFFICULTY_FIT" : "MIXED_PRACTICE";
    return { questionId: candidate.questionId, score, reasonCode };
  }).sort((a, b) => b.score - a.score || a.questionId.localeCompare(b.questionId));
  const selected = scored.slice(0, request.questionCount);
  return {
    rankedQuestionIds: selected.map((item) => item.questionId),
    scores: selected.map((item) => Number(item.score.toFixed(6))),
    reasons: selected.map(({ questionId, reasonCode }) => ({ questionId, reasonCode })),
    policyVersion,
    fallbackUsed: selected.length < request.questionCount,
  };
}

/** Persist this decision before revealing the question; attach the answer outcome later. */
export function createAdaptiveDecisionLog(input: {
  learnerGroupId: string;
  selectedQuestionId: string;
  eligibleQuestionIds: string[];
  selectionProbability: number;
  stateFeatures: number[];
  policyVersion: number;
  selectionScore: number;
  reasonCode: AdaptiveReasonCode;
  selectedAt?: string | Date;
}) {
  if (!/^[a-f0-9]{64}$/.test(input.learnerGroupId)) throw new Error("Decision logs require a keyed HMAC learner pseudonym");
  if (!input.eligibleQuestionIds.includes(input.selectedQuestionId) ||
    new Set(input.eligibleQuestionIds).size !== input.eligibleQuestionIds.length) {
    throw new Error("Selected question must be unique and present in the eligible candidate set");
  }
  // The current top-k policy is deterministic: 1 is an inclusion probability,
  // not a randomized propensity suitable for counterfactual policy evaluation.
  if (input.selectionProbability !== 1) throw new Error("The deterministic top-k policy requires selectionProbability=1");
  if (!input.stateFeatures.length || input.stateFeatures.some((value) => !Number.isFinite(value))) {
    throw new Error("Decision state features must be a non-empty finite vector");
  }
  if (!Number.isFinite(input.selectionScore) || !Number.isInteger(input.policyVersion) || input.policyVersion < 1) {
    throw new Error("Decision score and policy version are invalid");
  }
  const selectedAt = validDate(input.selectedAt ?? new Date());
  if (selectedAt === null) throw new Error("selectedAt must be a valid date");
  return {
    learnerGroupId: input.learnerGroupId,
    selectedQuestionId: input.selectedQuestionId,
    eligibleQuestionIds: [...input.eligibleQuestionIds],
    selectionProbability: input.selectionProbability,
    stateFeatures: [...input.stateFeatures],
    policyVersion: input.policyVersion,
    policyMode: "deterministic-top-k" as const,
    selectionScore: input.selectionScore,
    reasonCode: input.reasonCode,
    selectedAt: new Date(selectedAt).toISOString(),
    reward: null as number | null,
    outcomeStatus: "pending" as const,
  };
}
