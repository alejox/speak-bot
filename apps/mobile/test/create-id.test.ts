import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../src/app/create-id";

describe("createId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses crypto.randomUUID when available", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });
    expect(createId()).toBe("uuid-1");
  });

  it("falls back to a unique id outside secure contexts", () => {
    vi.stubGlobal("crypto", {});
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});
