import { PrismaClient } from "@prisma/client";
import { bootstrapAdmin } from "../src/bootstrapAdmin.js";

async function main(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password || password.length < 12) {
    throw new Error(
      "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters)."
    );
  }

  const db = new PrismaClient();
  try {
    await bootstrapAdmin(db, email, password);
    console.log(`Administrator account provisioned for ${email}.`);
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
  process.exitCode = 1;
});
