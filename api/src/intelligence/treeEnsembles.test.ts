import { describe, expect, it } from "vitest";
import {
  fitGradientBoostingRegressor, fitRandomForestRegressor,
  predictGradientBoosting, predictRandomForest,
} from "./treeEnsembles.js";

const rows = Array.from({ length: 160 }, (_, index) => {
  const signal = index / 10;
  return { features: [signal, index % 7], target: signal < 8 ? signal * 2 + 3 : signal * 4 - 5 };
});

describe("CPU regression tree ensembles", () => {
  it("fits deterministic random forest artifacts with normalized feature importance", () => {
    const first = fitRandomForestRegressor(rows, { trees: 32, seed: 7 });
    const second = fitRandomForestRegressor(rows, { trees: 32, seed: 7 });
    expect(first).toEqual(second);
    expect(first.trees).toHaveLength(32);
    expect(first.featureImportance.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
    expect(Number.isFinite(predictRandomForest(first, [4, 2]))).toBe(true);
  });

  it("fits gradient boosting residual trees and learns a nonlinear relationship", () => {
    const model = fitGradientBoostingRegressor(rows, { trees: 100, seed: 9 });
    const predictions = rows.map((row) => predictGradientBoosting(model, row.features));
    const mae = predictions.reduce((sum, value, index) => sum + Math.abs(value - rows[index].target), 0) / rows.length;
    expect(mae).toBeLessThan(1.2);
    expect(model.trees).toHaveLength(100);
  });

  it("rejects malformed features and invalid hyperparameters", () => {
    const forest = fitRandomForestRegressor(rows, { trees: 8 });
    expect(() => predictRandomForest(forest, [1])).toThrow("schema");
    expect(() => fitRandomForestRegressor(rows, { trees: 2 })).toThrow("between 8 and 256");
    expect(() => fitGradientBoostingRegressor(rows, { learningRate: 0 })).toThrow("learningRate");
  });
});
