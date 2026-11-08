import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Isolated SQLite per test run: points DATABASE_URL at a temp file, then
 * applies `prisma db push` against the real schema (no migration files needed
 * for throwaway DBs). Never touches api/prisma/dev.db.
 */

const API_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

let dir = "";
let db: PrismaClient | null = null;
const clients: PrismaClient[] = [];

export async function testDb(): Promise<PrismaClient> {
  if (!db) {
    dir = mkdtempSync(join(tmpdir(), "ecet-test-"));
    const url = `file:${join(dir, "test.db")}`;
    process.env.DATABASE_URL = url;
    execFileSync(
      "npx",
      [
        "prisma",
        "db",
        "push",
        "--skip-generate",
        "--schema",
        join(API_DIR, "prisma/schema.prisma"),
      ],
      { cwd: API_DIR, stdio: "pipe", env: { ...process.env, DATABASE_URL: url } }
    );
    db = new PrismaClient({ datasources: { db: { url } } });
    clients.push(db);
  }
  return db;
}

afterEach(async () => {
  if (db) {
    // Wipe between tests so each test starts from an empty bank.
    await db.attemptAnswer.deleteMany();
    await db.attempt.deleteMany();
    await db.stat.deleteMany();
    await db.question.deleteMany();
    await db.topic.deleteMany();
    await db.subject.deleteMany();
  }
});

export async function closeTestDb(): Promise<void> {
  for (const client of clients) await client.$disconnect();
  clients.length = 0;
  db = null;
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = "";
  }
}
