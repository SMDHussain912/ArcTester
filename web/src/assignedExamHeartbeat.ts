export type AssignmentHeartbeatFailure = "deadline" | "paused" | "transient";

/** Deadline failures must not pause the local timer: the client must still submit
 * its saved answers so the server can retain a late submission for review. */
export function classifyAssignmentHeartbeatFailure(message: string): AssignmentHeartbeatFailure {
  const normalized = message.toLowerCase();
  if (normalized.includes("time has expired") || normalized.includes("deadline has passed") || normalized.includes("submission deadline has passed")) {
    return "deadline";
  }
  if (normalized.includes("no active exam session") || normalized.includes("paused") || normalized.includes("locked by the invigilator")) {
    return "paused";
  }
  return "transient";
}
