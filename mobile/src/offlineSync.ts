import { getPendingSubmissions, keepSubmissionPending, markSubmissionSynced } from "./offlineStore";

type SubmissionApiResponse = {
  ok?: boolean;
  duplicate?: boolean;
  submission?: {
    id?: string;
    attemptUuid?: string;
  };
  error?: string;
};

export type OfflineSyncResult = {
  uploaded: number;
  failed: number;
  remaining: number;
};

const activeSyncs = new Map<string, Promise<OfflineSyncResult>>();

export function syncPendingSubmissions(
  apiUrl: string,
  token: string,
  userId?: string,
): Promise<OfflineSyncResult> {
  // Never share a queue drain across accounts: the token and database scope
  // are part of the identity of an in-flight sync operation.
  const key = `${userId ?? "default"}:${apiUrl.replace(/\\/+$/, "")}:${token}`;
  const existing = activeSyncs.get(key);
  if (existing) return existing;
  const active = runPendingSubmissionSync(apiUrl, token, userId).finally(() => {
    if (activeSyncs.get(key) === active) activeSyncs.delete(key);
  });
  activeSyncs.set(key, active);
  return active;
}

async function runPendingSubmissionSync(
  apiUrl: string,
  token: string,
  userId?: string,
): Promise<OfflineSyncResult> {
  const pending = await getPendingSubmissions(...(userId ? [userId] : []));
  let uploaded = 0;
  let failed = 0;

  for (const attempt of pending) {
    try {
      const response = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/exams/assignments/${encodeURIComponent(attempt.assignmentId)}/submission`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            attemptUuid: attempt.attemptUuid,
            startedAt: attempt.startedAt,
            submittedAt: attempt.submittedAt,
            answers: attempt.answers,
          }),
        }
      );

      const body = (await response.json().catch(() => ({}))) as SubmissionApiResponse;
      if (!response.ok || !body.submission?.id) {
        const message = body.error || `Submission sync failed with HTTP ${response.status}.`;
        if (userId) await keepSubmissionPending(attempt.assignmentId, message, userId);
        else await keepSubmissionPending(attempt.assignmentId, message);
        failed += 1;

        // Authentication and connectivity failures make subsequent uploads unlikely to work.
        if ([401, 403, 408, 425, 429].includes(response.status) || response.status >= 500) {
          break;
        }
        continue;
      }

      if (body.submission.attemptUuid !== attempt.attemptUuid) {
        const message = "The server returned a different attempt identifier. Manual review is required.";
        if (userId) await keepSubmissionPending(attempt.assignmentId, message, userId);
        else await keepSubmissionPending(attempt.assignmentId, message);
        failed += 1;
        continue;
      }

      if (userId) await markSubmissionSynced(attempt.assignmentId, body.submission.id, userId);
      else await markSubmissionSynced(attempt.assignmentId, body.submission.id);
      uploaded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network unavailable.";
      if (userId) await keepSubmissionPending(attempt.assignmentId, message, userId);
      else await keepSubmissionPending(attempt.assignmentId, message);
      failed += 1;
      break;
    }
  }

  const remaining = (await getPendingSubmissions(...(userId ? [userId] : []))).length;
  return { uploaded, failed, remaining };
}
