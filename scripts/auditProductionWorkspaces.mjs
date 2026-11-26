import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
for (const workspace of ["api", "web"]) {
  const manifest = JSON.parse(readFileSync(resolve(root, workspace, "package.json"), "utf8"));
  const directory = mkdtempSync(join(tmpdir(), "arctester-prod-audit-"));
  try {
    // Audit only runtime dependencies. npm audit --workspace currently includes
    // workspace dev tooling despite --omit=dev, so isolate the runtime manifest.
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      private: true,
      dependencies: manifest.dependencies ?? {},
    }, null, 2) + "\n");
    console.log("\nAuditing production dependencies for " + workspace + "...");
    execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: directory, stdio: "inherit" });
    execFileSync("npm", ["audit", "--audit-level=high"], { cwd: directory, stdio: "inherit" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
