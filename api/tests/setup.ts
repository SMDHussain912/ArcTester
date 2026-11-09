import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

/** Isolated PostgreSQL schema per test run; never touches the development schema. */

const API_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

let db: PrismaClient | null = null;
let schema = "";
let baseUrl = "";
const clients: PrismaClient[] = [];

function withSchema(url: string, schemaName: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("schema", schemaName);
  return parsed.toString();
}

async function createSchema(url: string, schemaName: string): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url } } });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  } finally {
    await admin.$disconnect();
  }
}

export async function testDb(): Promise<PrismaClient> {
  if (!db) {
    baseUrl = process.env.DATABASE_URL ?? "";
    if (!baseUrl) throw new Error("DATABASE_URL must point to the PostgreSQL test server.");
    schema = `unit_${randomUUID().replace(/-/g, "")}`;
    const url = withSchema(baseUrl, schema);
    await createSchema(baseUrl, schema);
    process.env.DATABASE_URL = url;
    try {
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
    } catch (error) {
      const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
      try {
        await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.$disconnect();
      }
      throw error;
    }
    db = new PrismaClient({ datasources: { db: { url } } });
    clients.push(db);
  }
  return db;
}

afterEach(async () => {
  if (db) {
    // Wipe between tests so each test starts from an empty bank.
    await db.announcementView.deleteMany();
    await db.announcement.deleteMany();
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
  if (baseUrl && schema) {
    const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
    try {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await admin.$disconnect();
    }
  }
  if (baseUrl) process.env.DATABASE_URL = baseUrl;
  schema = "";
  baseUrl = "";
}
