import { describe, expect, it } from "vitest";
import { classifyAssignmentHeartbeatFailure } from "./assignedExamHeartbeat";

describe("assigned-exam heartbeat failures", () => {
  it("keeps the timer running when the server reports an elapsed deadline", () => {
    expect(classifyAssignmentHeartbeatFailure("The examination time has expired.")).toBe("deadline");
    expect(classifyAssignmentHeartbeatFailure("The exam deadline has passed.")).toBe("deadline");
    expect(classifyAssignmentHeartbeatFailure("The examination submission deadline has passed.")).toBe("deadline");
  });

  it("pauses only when the server says the session is unavailable or locked", () => {
    expect(classifyAssignmentHeartbeatFailure("There is no active exam session.")).toBe("paused");
    expect(classifyAssignmentHeartbeatFailure("Session paused by invigilator.")).toBe("paused");
  });

  it("treats connection failures as transient", () => {
    expect(classifyAssignmentHeartbeatFailure("Network request failed")).toBe("transient");
  });
});
