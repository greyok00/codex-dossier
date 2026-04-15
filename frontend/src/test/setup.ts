import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

const originalConsoleError = console.error.bind(console);

console.error = (...args: unknown[]) => {
  const message = args
    .map((value) => (typeof value === "string" ? value : ""))
    .join(" ");

  if (
    message.includes("not wrapped in act") ||
    message.includes("testing environment is not configured to support act")
  ) {
    return;
  }

  originalConsoleError(...args);
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
