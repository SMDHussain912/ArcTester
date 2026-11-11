export type AssignmentHeartbeatFailure = "deadline" | "paused" | "transient";

/**
 * Classify a heartbeat failure from an HTTP status code instead of message text.
 * The server returns 409 for a paused session; 403/404 for deadline expiry so the
 * client keeps its local timer running and can still submit saved answers for
 * server-side review.
 */
export function classifyAssignmentHeartbeatFailure(status: number | null): AssignmentHeartbeatFailure {
  if (status === 409) return "paused";
  if (status === 404 || status === 403) return "deadline";
  return "transient";
}