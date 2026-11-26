import { describe, expect, it } from "vitest";
import { getSessionActionLabel } from "./securitySessionActions";

describe("mobile security session actions", () => {
  it("keeps current-session revocation explicit and labels other devices separately", () => {
    const session = { current: true };
    expect(getSessionActionLabel(session)).toBe("Sign out this device");
    expect(getSessionActionLabel({ current: false })).toBe("Revoke session");
  });
});
