import {
  evaluateLinearRegression,
  fitLinearRegression,
  splitChronological,
  type RegressionMetrics,
  type RegressionSample,
  type LinearRegressionArtifact,
} from "./linearRegression.js";

export interface CompletedAttemptScore {
  finishedAt: string | Date;
  correct: number;
  total: number;
}

export interface ScorePredictionEvaluation {
  model: LinearRegressionArtifact;
  trainRows: number;
  testRows: number;
  regression: RegressionMetrics;
  meanBaseline: RegressionMetrics;
  beatsMeanBaseline: boolean;
}

const HISTORY_WINDOW = 3;

/**
 * Builds leakage-safe next-attempt samples from completed attempts in time order.
 * Every feature uses attempts strictly before the attempt being predicted.
 */
export function buildNextAttemptScoreSamples(
  attempts: CompletedAttemptScore[],
): RegressionSample[] {
  const ordered = attempts.map((attempt, index) => {
    const finishedAt = attempt.finishedAt instanceof Date
      ? attempt.finishedAt.getTime()
      : new Date(attempt.finishedAt).getTime();
    if (!Number.isFinite(finishedAt)) throw new Error(`Attempt ${index} has an invalid finishedAt`);
    if (!Number.isInteger(attempt.correct) || !Number.isInteger(attempt.total) ||
      attempt.total <= 0 || attempt.correct < 0 || attempt.correct > attempt.total) {
      throw new Error(`Attempt ${index} has invalid score counts`);
    }
    return { ...attempt, timestamp: finishedAt, accuracy: attempt.correct / attempt.total };
  }).sort((a, b) => a.timestamp - b.timestamp);

  const samples: RegressionSample[] = [];
  for (let targetIndex = HISTORY_WINDOW; targetIndex < ordered.length; targetIndex += 1) {
    const history = ordered.slice(0, targetIndex);
    const recent = history.slice(-HISTORY_WINDOW);
    const previous = history[history.length - 1];
    samples.push({
      features: [
        history.length,
        previous.accuracy,
        recent.reduce((sum, attempt) => sum + attempt.accuracy, 0) / recent.length,
        history.reduce((sum, attempt) => sum + attempt.accuracy, 0) / history.length,
        previous.total,
      ],
      target: ordered[targetIndex].accuracy,
    });
  }
  return samples;
}

function evaluateMeanBaseline(
  training: RegressionSample[],
  testing: RegressionSample[],
): RegressionMetrics {
  const mean = training.reduce((sum, sample) => sum + sample.target, 0) / training.length;
  const errors = testing.map((sample) => sample.target - mean);
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const squared = errors.reduce((sum, error) => sum + error ** 2, 0);
  const targetMean = testing.reduce((sum, sample) => sum + sample.target, 0) / testing.length;
  const totalSquared = testing.reduce((sum, sample) => sum + (sample.target - targetMean) ** 2, 0);
  return {
    rows: testing.length,
    mae,
    rmse: Math.sqrt(squared / testing.length),
    rSquared: totalSquared > 0 ? 1 - squared / totalSquared : null,
  };
}

/** Trains on older observations and compares against the training-set mean baseline. */
export function trainAndEvaluateNextAttemptModel(
  attempts: CompletedAttemptScore[],
): ScorePredictionEvaluation {
  const samples = buildNextAttemptScoreSamples(attempts);
  if (samples.length < 4) {
    throw new Error("At least four sequential score samples are required for evaluation");
  }
  const { train, test } = splitChronological(samples, 0.25);
  const model = fitLinearRegression(train);
  const regression = evaluateLinearRegression(model, test);
  const meanBaseline = evaluateMeanBaseline(train, test);
  return {
    model,
    trainRows: train.length,
    testRows: test.length,
    regression,
    meanBaseline,
    beatsMeanBaseline: regression.mae < meanBaseline.mae,
  };
}
