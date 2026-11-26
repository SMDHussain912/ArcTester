import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { validateProductionSecurityConfig } from "../src/securityConfig.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required production environment variable is missing: ${name}`);
  return value;
}
function assertEmail(name: string): void {
  const value = required(name);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /\.example(?:\.|$)/i.test(value)) {
    throw new Error(`${name} must be a real operational email address, not a placeholder.`);
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== "production") throw new Error("Run security preflight with NODE_ENV=production in the target deployment environment.");
  validateProductionSecurityConfig();

  const jwtSecret = required("JWT_SECRET");
  if (Buffer.byteLength(jwtSecret, "utf8") < 32 || /change[_ -]?me|replace[_ -]?me|example|placeholder/i.test(jwtSecret)) {
    throw new Error("JWT_SECRET is weak or looks like a placeholder.");
  }
  required("JWT_ISSUER");
  required("JWT_AUDIENCE");
  required("CORS_ORIGINS");
  const hops = required("TRUST_PROXY_HOPS");
  if (!/^\d+$/.test(hops) || Number(hops) < 0 || Number(hops) > 10) throw new Error("TRUST_PROXY_HOPS must be an explicitly configured integer from 0 to 10.");
  const totpKey = required("TOTP_ENCRYPTION_KEY");
  if (!/^[a-fA-F0-9]{64}$/.test(totpKey)) throw new Error("TOTP_ENCRYPTION_KEY must be exactly 32 bytes encoded as 64 hex characters.");
  required("TURNSTILE_SECRET_KEY");

  const notice = new URL(required("STUDENT_PRIVACY_NOTICE_URL"));
  if (notice.protocol !== "https:" || /\.example(?:\.|$)/i.test(notice.hostname)) throw new Error("STUDENT_PRIVACY_NOTICE_URL must point to the published HTTPS privacy notice.");
  assertEmail("PRIVACY_CONTACT_EMAIL");
  assertEmail("GRIEVANCE_CONTACT_EMAIL");
  assertEmail("SECURITY_INCIDENT_OWNER_EMAIL");

  const database = new PrismaClient();
  try {
    const roles = await database.$queryRaw<Array<{
      roleName: string;
      isSuperuser: boolean;
      canCreateDb: boolean;
      canCreateRole: boolean;
      canCreateSchema: boolean;
    }>>`
      SELECT current_user AS "roleName",
             role.rolsuper AS "isSuperuser",
             role.rolcreatedb AS "canCreateDb",
             role.rolcreaterole AS "canCreateRole",
             has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateSchema"
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `;
    const role = roles[0];
    if (!role) throw new Error("Could not identify the connected PostgreSQL runtime role.");
    const elevated = [
      role.isSuperuser && "SUPERUSER",
      role.canCreateDb && "CREATEDB",
      role.canCreateRole && "CREATEROLE",
      role.canCreateSchema && "CREATE on public schema",
    ].filter(Boolean);
    if (elevated.length) throw new Error(`Runtime database role ${role.roleName} has excessive privileges: ${elevated.join(", ")}. Use a least-privilege runtime role and a separate migration role.`);
    console.log(`Security preflight passed for runtime database role '${role.roleName}'. No secret values were printed.`);
    console.log("Manual sign-off still required: host log residency/retention, object-storage policy, proxy chain, and legal/privacy contact applicability.");
  } finally {
    await database.$disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Security preflight failed.");
  process.exitCode = 1;
});
