import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // Absent in node-environment tests (e.g. the build check).
  globalThis.localStorage?.clear();
});
