import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { datasetToCsv, generateSyntheticDatasets } from "./datasetFactory.js";

function readOption(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {\nconst rowsPerDataset = Number(readOption("--rows", "1000"));
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

await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify({
    generator: "ArcTester Dataset Factory",
    generatorVersion: 1,
    synthetic: true,
    seed,
    rowsPerDataset,
    datasets: files.map(([filename]) => filename),
    warning: "Simulated data only. Do not use synthetic evaluation metrics as evidence of real-world model performance.",
  }, null, 2)}\n`,
  "utf8",
);

process.stdout.write(`Generated ${files.length} datasets (${rowsPerDataset} rows each) in ${outputDirectory}\n`);
