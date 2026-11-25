CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "deviceName" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "userAgent" TEXT NOT NULL DEFAULT '',
  "ipAddress" TEXT NOT NULL DEFAULT '',
  "loginMethod" TEXT NOT NULL DEFAULT 'password',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthSession_userId_revokedAt_lastSeenAt_idx" ON "AuthSession"("userId","revokedAt","lastSeenAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE TABLE "LoginEvent" (
  "id" TEXT NOT NULL,
  "userId" INTEGER,
  "email" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'password',
  "ipAddress" TEXT NOT NULL DEFAULT '',
  "userAgent" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId","createdAt");
CREATE INDEX "LoginEvent_email_createdAt_idx" ON "LoginEvent"("email","createdAt");
CREATE TABLE "TotpCredential" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  "enabledAt" TIMESTAMP(3),
  "recoveryCodesJson" TEXT NOT NULL DEFAULT '[]',
  "lastUsedCounter" INTEGER NOT NULL DEFAULT -1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TotpCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TotpCredential_userId_key" UNIQUE ("userId"),
  CONSTRAINT "TotpCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PasskeyCredential" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "signCount" INTEGER NOT NULL DEFAULT 0,
  "transports" TEXT NOT NULL DEFAULT '[]',
  "name" TEXT NOT NULL DEFAULT 'Passkey',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasskeyCredential_credentialId_key" UNIQUE ("credentialId"),
  CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PasskeyCredential_userId_createdAt_idx" ON "PasskeyCredential"("userId","createdAt");
CREATE TABLE "AuthChallenge" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "challenge" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthChallenge_challenge_key" UNIQUE ("challenge"),
  CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthChallenge_userId_purpose_expiresAt_idx" ON "AuthChallenge"("userId","purpose","expiresAt");
