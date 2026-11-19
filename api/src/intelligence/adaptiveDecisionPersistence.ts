import type { PrismaClient } from "@prisma/client";
import type { AdaptiveSelection, AdaptiveReasonCode } from "./adaptiveQuestionSelector.js";

type AdaptiveLogDb = Pick<PrismaClient, "adaptiveDecisionLog">;

const REASONS = new Set<AdaptiveReasonCode>([
  "WEAK_TOPIC", "SPACED_REVIEW", "DIFFICULTY_FIT", "NOVELTY", "MIXED_PRACTICE",
]);

function toQuestionId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Adaptive decision question IDs must be positive database question IDs");
  }
  return id;
}

/**
 * Persist the complete eligible set and each selected question before the
 * question is returned to a learner. The learner identifier must be a keyed
 * HMAC pseudonym; raw user IDs and personal data are never accepted.
 */
export async function persistAdaptiveSelection(
  db: AdaptiveLogDb,
  input: {
    attemptId: number;
    learnerGroupId: string;
    eligibleQuestionIds: string[];
    stateFeatures: number[];
    selection: AdaptiveSelection;
    selectedAt?: Date;
  },
): Promise<{ created: number; skipped: number }> {
  if (!Number.isSafeInteger(input.attemptId) || input.attemptId < 1) {
    throw new Error("Adaptive decisions require a valid practice attempt ID");
  }
  if (!/^[a-f0-9]{64}$/.test(input.learnerGroupId)) {
    throw new Error("Adaptive decisions require a keyed HMAC learner pseudonym");
  }
  if (!input.stateFeatures.length || input.stateFeatures.some((value) => !Number.isFinite(value))) {
    throw new Error("Adaptive decision state features must be a non-empty finite vector");
  }
  if (!Number.isInteger(input.selection.policyVersion) || input.selection.policyVersion < 1 ||
      input.selection.rankedQuestionIds.length !== input.selection.scores.length ||
      input.selection.rankedQuestionIds.length !== input.selection.reasons.length) {
    throw new Error("Adaptive selection metadata is inconsistent");
  }

  const eligibleIds = input.eligibleQuestionIds.map(toQuestionId);
  if (new Set(eligibleIds).size !== eligibleIds.length) {
    throw new Error("Adaptive eligible question IDs must be unique");
  }
  const eligibleSet = new Set(eligibleIds);
  const selectedIds = input.selection.rankedQuestionIds.map(toQuestionId);
  if (new Set(selectedIds).size !== selectedIds.length ||
      selectedIds.some((id) => !eligibleSet.has(id))) {
    throw new Error("Every selected question must be unique and present in the eligible set");
  }

  const reasonByQuestion = new Map(input.selection.reasons.map((reason) => [toQuestionId(reason.questionId), reason.reasonCode]));
  const rows = selectedIds.map((selectedQuestionId, index) => {
    const score = input.selection.scores[index];
    const reasonCode = reasonByQuestion.get(selectedQuestionId);
    if (!Number.isFinite(score) || !reasonCode || !REASONS.has(reasonCode)) {
      throw new Error("Adaptive selection contains an invalid score or reason code");
    }
    return {
      attemptId: input.attemptId,
      learnerGroupId: input.learnerGroupId,
      selectedQuestionId,
      eligibleQuestionIdsJson: JSON.stringify(eligibleIds),
      selectionProbability: 1,
      stateFeaturesJson: JSON.stringify(input.stateFeatures),
      policyVersion: input.selection.policyVersion,
      policyMode: "deterministic-top-k",
      reasonCode,
      selectionScore: score,
      selectedAt: input.selectedAt ?? new Date(),
      reward: null,
      outcomeStatus: "pending",
    };
  });

  if (!rows.length) return { created: 0, skipped: 0 };
  const result = await db.adaptiveDecisionLog.createMany({ data: rows, skipDuplicates: true });
  return { created: result.count, skipped: rows.length - result.count };
}

/**
 * Attach an observed answer reward exactly once. Call only after a persisted
 * AttemptAnswer exists; abandoned/unanswered questions must remain pending.
 */
export async function recordAdaptiveAnswerOutcome(
  db: AdaptiveLogDb,
  input: { attemptId: number; questionId: number; isCorrect: boolean; outcomeAt?: Date },
): Promise<boolean> {
  if (!Number.isSafeInteger(input.attemptId) || input.attemptId < 1 ||
      !Number.isSafeInteger(input.questionId) || input.questionId < 1 ||
      typeof input.isCorrect !== "boolean") {
    throw new Error("Adaptive answer outcome is invalid");
  }
  const result = await db.adaptiveDecisionLog.updateMany({
    where: {
      attemptId: input.attemptId,
      selectedQuestionId: input.questionId,
      outcomeStatus: "pending",
    },
    data: {
      reward: input.isCorrect ? 1 : 0,
      outcomeStatus: "observed",
      outcomeAt: input.outcomeAt ?? new Date(),
    },
  });
  return result.count === 1;
}
