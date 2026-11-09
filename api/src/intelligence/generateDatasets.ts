import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { datasetToCsv, generateSyntheticDatasets } from "./datasetFactory.js";
import { analyzeDatasetQuality, SYNTHETIC_DATASET_DEFINITIONS } from "./datasetQuality.js";

function readOption(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const rowsPerDataset = Number(readOption("--rows", "1000"));
  const seed = Number(readOption("--seed", "42"));
  const outputDirectory = path.resolve(readOption("--out", "../datasets/synthetic"));
  const datasets = generateSyntheticDatasets({ rowsPerDataset, seed });

  await mkdir(outputDirectory, { recursive: true });
  const files = [
    ["student-performance.csv", datasets.studentPerformance],
    ["topic-mastery.csv", datasets.topicMastery],
    ["exam-readiness.csv", datasets.examReadiness],
    ["learning-behaviour.csv", datasets.learningBehaviour],
    ["score-prediction.csv", datasets.scorePrediction],
  ] as const;

  for (const [filename, rows] of files) {
    await writeFile(path.join(outputDirectory, filename), datasetToCsv(rows), "utf8");
  }

  const datasetKeys = ["studentPerformance", "topicMastery", "examReadiness", "learningBehaviour", "scorePrediction"] as const;
  const qualityReports = Object.fromEntries(datasetKeys.map((key, index) => [
    files[index][0],
    analyzeDatasetQuality(datasets[key], SYNTHETIC_DATASET_DEFINITIONS[key]),
  ]));

  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify({
      generator: "ArcTester Dataset Factory",
      generatorVersion: 2,
      synthetic: true,
      seed,
      rowsPerDataset,
      datasets: files.map(([filename]) => filename),
      definitions: SYNTHETIC_DATASET_DEFINITIONS,
      qualityReports,
      warning: "Simulated data only. Do not use synthetic evaluation metrics as evidence of real-world model performance.",
    }, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(`Generated ${files.length} datasets (${rowsPerDataset} rows each) in ${outputDirectory}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Dataset generation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
