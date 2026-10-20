-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mode" TEXT NOT NULL DEFAULT 'mock',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" DATETIME,
    "finishedAt" DATETIME,
    "expired" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Attempt" ("finishedAt", "id", "mode", "startedAt") SELECT "finishedAt", "id", "mode", "startedAt" FROM "Attempt";
DROP TABLE "Attempt";
ALTER TABLE "new_Attempt" RENAME TO "Attempt";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
