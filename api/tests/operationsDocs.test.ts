import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
const securityChecklist = readFileSync(resolve(repositoryRoot, "docs/SECURITY_REVIEW_CHECKLIST.md"), "utf8");
const backupGuide = readFileSync(resolve(repositoryRoot, "docs/BACKUP_RESTORE_REHEARSAL.md"), "utf8");
const backupScriptPath = resolve(repositoryRoot, "scripts/backup-restore-rehearsal.sh");
const backupScript = readFileSync(backupScriptPath, "utf8");

describe("Phase 16 operational readiness artifacts", () => {
  it("documents the current Vite monorepo and delegates phase status to the master roadmap", () => {
    expect(readme).toContain("React + TypeScript + Vite");
    expect(readme).toContain("ARC_TESTER_16_PHASE_MASTER_ROADMAP.md");
    expect(readme).not.toContain("Next.js");
    expect(readme).not.toContain("## Phases");
  });

  it("covers authentication, CORS, cookies, rate limits and dependency audit without claiming production verification", () => {
    for (const section of ["Authentication and authorization", "CORS and CSRF", "Cookies and browser sessions", "Rate limits and abuse controls", "Dependency and supply-chain audit", "NOT VERIFIED"]) {
      expect(securityChecklist).toContain(section);
    }
  });

  it("documents an empty-target restore rehearsal and explicit NOT VERIFIED checks", () => {
    expect(backupGuide).toContain("empty rehearsal database");
    expect(backupGuide).toContain("scripts/backup-restore-rehearsal.sh --execute");
    expect(backupGuide).toContain("NOT VERIFIED");
    expect(backupGuide).toContain("does not delete or overwrite an existing backup file");
  });

  it("passes shell syntax validation and guards the rehearsal target without destructive restore flags", () => {
    expect(() => execFileSync("bash", ["-n", backupScriptPath])).not.toThrow();
    expect(backupScript).toContain("--execute");
    expect(backupScript).toContain("rehearsal");
    expect(backupScript).toContain("information_schema.tables");
    expect(backupScript).toContain("Refusing to overwrite existing backup file");
    expect(backupScript).toContain('[[ -e "$backup_file" || -L "$backup_file" ]]');
    expect(backupScript).not.toMatch(/pg_restore\s+[^\n]*--clean|dropdb|DROP DATABASE|rm\s+-rf/i);
  });
});
