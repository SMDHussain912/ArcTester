import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React 18 keeps mounted components between tests unless we unmount them.
afterEach(() => {
  cleanup();
});