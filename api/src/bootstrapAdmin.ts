import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "./auth.js";

/**
 * One-time administrator bootstrap. A PostgreSQL transaction-scoped advisory
 * lock serializes concurrent invocations, so two processes cannot both observe
 * an empty administrator table and provision different administrator accounts.
 */
export async function bootstrapAdmin(
  db: PrismaClient,
  email: string,
  password: string,
): Promise<void> {
  const passwordHash = hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "DO LANGUAGE plpgsql 'BEGIN PERFORM pg_advisory_xact_lock(1380011073, 1); END'"
    );
    const existingAdmins = await tx.user.count({ where: { role: "ADMIN" } });
    if (existingAdmins > 0) {
      throw new Error("An administrator already exists. Bootstrap is one-time only.");
    }

    await tx.user.upsert({
      where: { email },
      create: { email, passwordHash, role: "ADMIN" },
      update: { passwordHash, role: "ADMIN" },
    });
  });
}
