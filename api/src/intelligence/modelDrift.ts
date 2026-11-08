export interface DriftFeature {
  name: string;
  type: "numeric" | "categorical";
  categories?: string[];
}

export interface DriftSample {
  features: Record<string, number | string>;
  target: number;
}

export interface DriftAssessment {
  featureName: string;
  expected: Record<string, number>;
  observed: Record<string, number>;
  sampleCount: number;
  psi: number | null;
  status: "NO_DATA" | "LOW" | "MODERATE" | "HIGH";
}

function numericBoundaries(featureName: string, samples: DriftSample[]): number[] {
  const values = samples.map((sample) => sample.features[featureName])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!values.length) throw new Error(`Training baseline has no numeric values for ${featureName}`);
  return [0.2, 0.4, 0.6, 0.8].map((quantile) => values[Math.min(values.length - 1, Math.floor(values.length * quantile))]!);
}

/** Converts a feature value to a coarse training-relative bucket; raw values are never persisted. */
export function driftBucket(
  feature: DriftFeature,
  value: number | string,
  baselineSamples: DriftSample[],
): string {
  if (feature.type === "categorical") {
    const categories = feature.categories ?? [];
    if (typeof value !== "string") throw new Error(`Feature ${feature.name} must be categorical`);
    const index = categories.indexOf(value);
    return index < 0 ? "unknown" : `category_${index}`;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Feature ${feature.name} must be numeric`);
  const boundaries = numericBoundaries(feature.name, baselineSamples);
  let index = 0;
  while (index < boundaries.length && value > boundaries[index]!) index += 1;
  return `quantile_${index}`;
}

export function expectedDriftCounts(
  feature: DriftFeature,
  samples: DriftSample[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (feature.type === "categorical") {
    for (const [index] of (feature.categories ?? []).entries()) counts[`category_${index}`] = 0;
    counts.unknown = 0;
  } else {
    for (let index = 0; index <= 4; index += 1) counts[`quantile_${index}`] = 0;
  }
  for (const sample of samples) {
    const bucket = driftBucket(feature, sample.features[feature.name]!, samples);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

export function assessFeatureDrift(
  featureName: string,
  expected: Record<string, number>,
  observed: Record<string, number>,
): DriftAssessment {
  const sampleCount = Object.values(observed).reduce((sum, count) => sum + count, 0);
  if (sampleCount === 0) return { featureName, expected, observed, sampleCount, psi: null, status: "NO_DATA" };
  const keys = new Set([...Object.keys(expected), ...Object.keys(observed)]);
  const expectedTotal = Object.values(expected).reduce((sum, count) => sum + count, 0);
  if (expectedTotal <= 0) throw new Error(`Training baseline has no observations for ${featureName}`);
  let psi = 0;
  for (const key of keys) {
    const expectedShare = Math.max((expected[key] ?? 0) / expectedTotal, 0.0001);
    const observedShare = Math.max((observed[key] ?? 0) / sampleCount, 0.0001);
    psi += (observedShare - expectedShare) * Math.log(observedShare / expectedShare);
  }
  const status = psi >= 0.2 ? "HIGH" : psi >= 0.1 ? "MODERATE" : "LOW";
  return { featureName, expected, observed, sampleCount, psi, status };
}
