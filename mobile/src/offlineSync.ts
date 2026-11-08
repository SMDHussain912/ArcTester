import {
  getPendingSubmissions,
  keepSubmissionPending,
  markSubmissionSynced,
} from "./offlineStore";

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

export async function syncPendingSubmissions(
  apiUrl: string,
  token: string,
): Promise<OfflineSyncResult> {
  const pending = await getPendingSubmissions();
  let uploaded = 0;
  let failed = 0;

  for (const attempt of pending) {
    try {
      const response = await fetch(
        `${apiUrl.replace(/\\/+$/, "")}/exams/assignments/${encodeURIComponent(attempt.assignmentId)}/submission`,
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
        },
      );

      const body = (await response.json().catch(() => ({}))) as SubmissionApiResponse;
      if (!response.ok || !body.submission?.id) {
        const message = body.error || `Submission sync failed with HTTP ${response.status}.`;
        await keepSubmissionPending(attempt.assignmentId, message);
        failed += 1;

        // Authentication and connectivity failures make subsequent uploads unlikely to work.
        if (response.status === 401 || response.status === 403 || response.status >= 500) {
          break;
        }
        continue;
      }

      if (body.submission.attemptUuid && body.submission.attemptUuid !== attempt.attemptUuid) {
        await keepSubmissionPending(
          attempt.assignmentId,
          "The server returned a different attempt identifier. Manual review is required.",
        );
        failed += 1;
        continue;
      }

      await markSubmissionSynced(attempt.assignmentId, body.submission.id);
      uploaded += 1;
    } catch (error) {
      await keepSubmissionPending(
        attempt.assignmentId,
        error instanceof Error ? error.message : "Network unavailable.",
      );
      failed += 1;
      break;
    }
  }

  const remaining = (await getPendingSubmissions()).length;
  return { uploaded, failed, remaining };
}
