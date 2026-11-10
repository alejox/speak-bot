import { describe, expect, it, vi } from "vitest";
import { copyText } from "../src/adapters/clipboard";

describe("copyText", () => {
  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyText("http://localhost:4545/overlay", { clipboard: { writeText }, document })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("http://localhost:4545/overlay");
  });

  it("falls back to a hidden text area when the Clipboard API is missing or refused", async () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    const refused = { writeText: async () => Promise.reject(new Error("denied")) };

    expect(await copyText("abc", { clipboard: refused, document })).toBe(true);
    expect(await copyText("abc", { clipboard: undefined, document })).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure when nothing can copy", async () => {
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
    expect(await copyText("abc", { clipboard: undefined, document })).toBe(false);
  });
});
