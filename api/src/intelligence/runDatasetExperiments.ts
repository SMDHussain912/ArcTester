import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateSyntheticDatasets } from "./datasetFactory.js";
import { SYNTHETIC_DATASET_DEFINITIONS } from "./datasetQuality.js";
import {
  prepareDataset, runTunedClassifierExperiments, runRegressionExperiment,
  serializeExperimentArtifact,
} from "./datasetPipeline.js";
import { ModelRegistry } from "./modelRegistry.js";

function readOption(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const rowsPerDataset = Number(readOption("--rows", "1000"));
  const seed = Number(readOption("--seed", "42"));
  const outputDirectory = path.resolve(readOption("--out", "../datasets/experiments"));
  const datasets = generateSyntheticDatasets({ rowsPerDataset, seed });
  await mkdir(path.join(outputDirectory, "models"), { recursive: true });
  const registry = new ModelRegistry(path.join(outputDirectory, "models", "registry"));

  const reports: Record<string, unknown> = {};
  const entries = [
    ["student-performance", "studentPerformance"],
    ["topic-mastery", "topicMastery"],
    ["exam-readiness", "examReadiness"],
    ["learning-behaviour", "learningBehaviour"],
    ["score-prediction", "scorePrediction"],
  ] as const;

  for (const [name, key] of entries) {
    const definition = SYNTHETIC_DATASET_DEFINITIONS[key];
    const prepared = prepareDataset(datasets[key], definition, { seed });
    if (definition.task === "binary-classification") {
      const results = runTunedClassifierExperiments(prepared.train, prepared.test, { folds: 5, seed });
      reports[name] = {
        task: definition.task,
        trainRows: prepared.trainRows,
        testRows: prepared.testRows,
        featureNames: prepared.featureNames,
        targetColumn: definition.targetColumn,
        models: results.map(({ algorithm, parameters, crossValidation, metrics }) => ({ algorithm, parameters, crossValidation, heldOutMetrics: metrics })),
      };
      for (const result of results) {
        await registry.register({
          modelId: `${name}-${result.algorithm}`,
          algorithm: result.algorithm as "logistic-regression" | "knn" | "decision-tree" | "gaussian-naive-bayes",
          task: "binary-classification",
          dataset: name,
          targetColumn: definition.targetColumn,
          featureSchema: prepared.featureSchema,
          model: result.model,
        });
        await writeFile(
          path.join(outputDirectory, "models", `${name}-${result.algorithm}.json`),
          serializeExperimentArtifact({
            dataset: name,
            featureNames: prepared.featureNames,
            featureSchema: prepared.featureSchema,
            targetColumn: definition.targetColumn,
            task: definition.task,
            model: result.model,
          }) + "\n",
          "utf8",
        );
      }
    } else {
      const result = runRegressionExperiment(prepared.train, prepared.test);
      reports[name] = {
        task: definition.task,
        trainRows: prepared.trainRows,
        testRows: prepared.testRows,
        featureNames: prepared.featureNames,
        targetColumn: definition.targetColumn,
        models: [{ algorithm: result.algorithm, heldOutMetrics: result.metrics }],
      };
      await registry.register({
        modelId: `${name}-${result.algorithm}`,
        algorithm: result.algorithm,
        task: "regression",
        dataset: name,
        targetColumn: definition.targetColumn,
        featureSchema: prepared.featureSchema,
        model: result.model,
      });
      await writeFile(
        path.join(outputDirectory, "models", `${name}-${result.algorithm}.json`),
        serializeExperimentArtifact({
          dataset: name,
          featureNames: prepared.featureNames,
          featureSchema: prepared.featureSchema,
          targetColumn: definition.targetColumn,
          task: definition.task,
          model: result.model,
        }) + "\n",
        "utf8",
      );
    }
  }

  await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify({
    generatedBy: "ArcTester Dataset-to-Model Pipeline",
    synthetic: true,
    seed,
    rowsPerDataset,
    split: "deterministic row-level holdout; preprocessing fitted on training rows only; classifier tuning uses stratified cross-validation within training rows",
    warning: "Metrics from synthetic data are for pipeline verification only, not evidence of real-world predictive performance.",
    modelRegistry: path.join(outputDirectory, "models", "registry"),
    experiments: reports,
  }, null, 2)}\n`, "utf8");
  process.stdout.write(`Completed experiments for ${entries.length} datasets in ${outputDirectory}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Dataset experiments failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
