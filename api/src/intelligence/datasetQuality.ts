import type { DatasetRow, SyntheticDatasetBundle } from "./datasetFactory.js";

export interface DatasetDefinition {
  description: string;
  idColumn: string;
  featureColumns: string[];
  targetColumn: string;
  task: "binary-classification" | "regression";
}

export const SYNTHETIC_DATASET_DEFINITIONS: Record<keyof SyntheticDatasetBundle, DatasetDefinition> = {
  studentPerformance: {
    description: "Predict a student's later formal exam score from prior practice behaviour.",
    idColumn: "student_id",
    featureColumns: ["practice_attempts", "average_accuracy", "recent_accuracy", "subjects_covered", "questions_answered"],
    targetColumn: "target_formal_score_percentage",
    task: "regression",
  },
  topicMastery: {
    description: "Estimate latent topic mastery from observed practice evidence.",
    idColumn: "student_id",
    featureColumns: ["subject", "topic", "questions_attempted", "questions_correct", "accuracy"],
    targetColumn: "target_mastery_label",
    task: "binary-classification",
  },
  examReadiness: {
    description: "Estimate formal exam readiness from practice history before the exam.",
    idColumn: "student_id",
    featureColumns: ["prior_practice_attempts", "latest_accuracy", "recent_accuracy", "overall_accuracy", "prior_questions_answered", "subject_count"],
    targetColumn: "target_readiness_label",
    task: "binary-classification",
  },
  learningBehaviour: {
    description: "Estimate engagement from study consistency and activity.",
    idColumn: "student_id",
    featureColumns: ["study_days_last_30", "sessions_last_30", "average_session_minutes", "longest_current_streak_days", "completion_rate", "study_consistency"],
    targetColumn: "target_engagement_label",
    task: "binary-classification",
  },
  scorePrediction: {
    description: "Predict next-attempt accuracy using only earlier attempt history.",
    idColumn: "student_id",
    featureColumns: ["attempt_number", "previous_accuracy", "recent_accuracy", "historical_average_accuracy", "questions_answered_before_prediction"],
    targetColumn: "target_next_attempt_accuracy",
    task: "regression",
  },
};

export interface NumericColumnSummary {
  min: number;
  max: number;
  mean: number;
}

export interface DatasetQualityReport {
  rows: number;
  columns: string[];
  duplicateIds: number;
  missingValues: number;
  invalidRows: number;
  numericFeatures: Record<string, NumericColumnSummary>;
  targetDistribution: Record<string, number>;
  warnings: string[];
}

/** Summarizes structural quality without treating synthetic data as real evidence. */
export function analyzeDatasetQuality(
  rows: DatasetRow[],
  definition: DatasetDefinition,
): DatasetQualityReport {
  if (definition.featureColumns.includes(definition.targetColumn)) {
    throw new Error("Target column must not appear in featureColumns");
  }
  if (rows.length === 0) throw new Error("Cannot analyze an empty dataset");
  const columns = Object.keys(rows[0]);
  const required = [definition.idColumn, ...definition.featureColumns, definition.targetColumn];
  const missingColumns = required.filter((column) => !columns.includes(column));
  if (missingColumns.length) throw new Error(`Dataset is missing columns: ${missingColumns.join(", ")}`);

  const ids = new Set<string>();
  let duplicateIds = 0;
  let missingValues = 0;
  let invalidRows = 0;
  const targetDistribution: Record<string, number> = {};
  const numericFeatures: Record<string, NumericColumnSummary> = {};

  for (const column of required) {
    if (rows.some((row) => row[column] === null || row[column] === undefined || row[column] === "")) {
      missingValues += rows.filter((row) => row[column] === null || row[column] === undefined || row[column] === "").length;
    }
  }

  for (const row of rows) {
    const id = String(row[definition.idColumn] ?? "");
    if (ids.has(id)) duplicateIds += 1;
    ids.add(id);
    const target = row[definition.targetColumn];
    const targetKey = String(target);
    targetDistribution[targetKey] = (targetDistribution[targetKey] ?? 0) + 1;
    if (definition.featureColumns.some((column) => {
      const value = row[column];
      return value === null || value === undefined || value === "" ||
        (typeof value === "number" && !Number.isFinite(value));
    })) invalidRows += 1;
  }

  for (const column of definition.featureColumns) {
    const values = rows.map((row) => row[column]);
    if (values.every((value): value is number => typeof value === "number" && Number.isFinite(value))) {
      numericFeatures[column] = {
        min: values.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY),
        max: values.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY),
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      };
    }
  }

  const warnings: string[] = [];
  if (duplicateIds) warnings.push(`${duplicateIds} duplicate identifier(s)`);
  if (missingValues) warnings.push(`${missingValues} missing value(s)`);
  if (invalidRows) warnings.push(`${invalidRows} row(s) have invalid feature values`);
  if (definition.task === "binary-classification" && Object.keys(targetDistribution).length < 2) {
    warnings.push("Binary target contains only one observed class");
  }
  if (definition.task === "binary-classification" && Object.keys(targetDistribution).length > 2) {
    warnings.push("Binary target contains more than two distinct values");
  }

  return { rows: rows.length, columns, duplicateIds, missingValues, invalidRows, numericFeatures, targetDistribution, warnings };
}
