import type { PrismaClient } from "@prisma/client";
import {
  buildNextAttemptScoreSamples,
  trainAndEvaluateNextAttemptModel,
  type CompletedAttemptScore,
} from "./scorePrediction.js";
import { fitLinearRegression, predictLinearRegression } from "./linearRegression.js";

export const SCORE_PREDICTION_MINIMUM_SAMPLES = 20;
export const SCORE_PREDICTION_HISTORY_WINDOW = 3;
export const SCORE_PREDICTION_MAX_ATTEMPTS = 250;

export type StudentScorePrediction =
  | {
      status: "insufficient_data";
      completedAttempts: number;
      availableSamples: number;
      requiredSamples: number;
      requiredCompletedAttempts: number;
      message: string;
      populationFeatures?: Record<string, number>;
    }
  | {
      status: "baseline_not_beaten";
      completedAttempts: number;
      evaluationSamples: number;
      modelMae: number;
      baselineMae: number;
      message: string;
      populationFeatures?: Record<string, number>;
    }
  | {
      status: "ready";
      completedAttempts: number;
      trainingSamples: number;
      evaluationSamples: number;
      predictedScorePercent: number;
      predictionInterval: {
        lowerPercent: number;
        upperPercent: number;
        estimatedErrorPercent: number;
        method: "walk-forward-rmse";
      };
      modelMae: number;
      baselineMae: number;
      message: string;
      populationFeatures?: Record<string, number>;
    };

function nextAttemptFeatures(attempts: CompletedAttemptScore[]): number[] {
  const history = attempts.slice().sort((a, b) =>
    (a.finishedAt instanceof Date ? a.finishedAt.getTime() : new Date(a.finishedAt).getTime()) - (b.finishedAt instanceof Date ? b.finishedAt.getTime() : new Date(b.finishedAt).getTime())
  );
  const recent = history.slice(-SCORE_PREDICTION_HISTORY_WINDOW);
  const previous = history[history.length - 1];
  const accuracies = history.map((attempt) => attempt.correct / attempt.total);
  return [
    history.length,
    previous.correct / previous.total,
    recent.reduce((sum, attempt) => sum + attempt.correct / attempt.total, 0) / recent.length,
    accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length,
    previous.total,
  ];
}

/**
 * Predicts only from the authenticated student's completed practice attempts.
 * The model is exposed only when a chronological holdout beats the training-mean baseline.
 */
export async function getStudentScorePrediction(
  db: PrismaClient,
  userId: number,
): Promise<StudentScorePrediction> {
  const rows = await db.attempt.findMany({
    where: {
      userId,
      mode: "practice",
      finishedAt: { not: null },
      answers: { some: {} },
    },
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    take: SCORE_PREDICTION_MAX_ATTEMPTS,
    select: {
      finishedAt: true,
      answers: { select: { isCorrect: true } },
    },
  });

  const attempts: CompletedAttemptScore[] = rows.flatMap((row) => {
    if (!row.finishedAt || row.answers.length === 0) return [];
    return [{
      finishedAt: row.finishedAt,
      correct: row.answers.filter((answer) => answer.isCorrect).length,
      total: row.answers.length,
    }];
  });
  attempts.reverse();
  const samples = buildNextAttemptScoreSamples(attempts);

  if (samples.length < SCORE_PREDICTION_MINIMUM_SAMPLES) {
    return {
      status: "insufficient_data",
      completedAttempts: attempts.length,
      availableSamples: samples.length,
      requiredSamples: SCORE_PREDICTION_MINIMUM_SAMPLES,
      requiredCompletedAttempts: SCORE_PREDICTION_MINIMUM_SAMPLES + SCORE_PREDICTION_HISTORY_WINDOW,
      message: "Complete more practice attempts to build a reliable personal score history.",
      ...(populationFeatureRecord(attempts) ? { populationFeatures: populationFeatureRecord(attempts) } : {}),
    };
  }

  const evaluation = trainAndEvaluateNextAttemptModel(attempts);
  if (!evaluation.beatsMeanBaseline) {
    return {
      status: "baseline_not_beaten",
      completedAttempts: attempts.length,
      evaluationSamples: evaluation.testRows,
      modelMae: evaluation.regression.mae,
      baselineMae: evaluation.meanBaseline.mae,
      message: "There is not enough predictive improvement over a simple baseline to show a score estimate yet.",
      ...(populationFeatureRecord(attempts) ? { populationFeatures: populationFeatureRecord(attempts) } : {}),
    };
  }

  const finalModel = fitLinearRegression(samples);
  const rawPrediction = predictLinearRegression(finalModel, nextAttemptFeatures(attempts));
  return {
    status: "ready",
    completedAttempts: attempts.length,
    trainingSamples: samples.length,
    evaluationSamples: evaluation.testRows,
    predictedScorePercent: Math.round(Math.min(1, Math.max(0, rawPrediction)) * 100),
    predictionInterval: {
      lowerPercent: Math.round(Math.min(1, Math.max(0, rawPrediction - 1.96 * evaluation.regression.rmse)) * 100),
      upperPercent: Math.round(Math.min(1, Math.max(0, rawPrediction + 1.96 * evaluation.regression.rmse)) * 100),
      estimatedErrorPercent: Math.round(evaluation.regression.rmse * 1000) / 10,
      method: "walk-forward-rmse",
    },
    modelMae: evaluation.regression.mae,
    baselineMae: evaluation.meanBaseline.mae,
    message: "Estimate based on your completed practice history; actual results may differ.",
    populationFeatures: populationFeatureRecord(attempts),
  };
}
