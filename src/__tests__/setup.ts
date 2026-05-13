import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

beforeEach(() => {
  global.fetch = vi.fn().mockRejectedValue(new Error("fetch not mocked"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
