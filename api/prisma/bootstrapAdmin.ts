import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth.js";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !password || password.length < 12) {
  throw new Error(
    "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters)."
  );
}

const db = new PrismaClient();

try {
  const existingAdmins = await db.user.count({ where: { role: "ADMIN" } });
  if (existingAdmins > 0) {
    throw new Error("An administrator already exists. Bootstrap is one-time only.");
  }

  await db.user.upsert({
    where: { email },
    create: { email, passwordHash: hashPassword(password), role: "ADMIN" },
    update: { passwordHash: hashPassword(password), role: "ADMIN" },
  });

  console.log(`Administrator account provisioned for ${email}.`);
} finally {
  await db.$disconnect();
}
