import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // Absent in node-environment tests (e.g. the build check).
  globalThis.localStorage?.clear();
  // The app marks its appearance on the root element, which outlives a test's render.
  globalThis.document?.documentElement.removeAttribute("data-theme");
  globalThis.document?.documentElement.removeAttribute("data-text-size");
});

// jsdom has no modal dialogs yet: a minimal stand-in for showModal() and close().
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
