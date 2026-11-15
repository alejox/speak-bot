import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { installCrashGuard } from "../src/crash-guard";

describe("installCrashGuard", () => {
  it("logs an uncaught exception with its code, origin and stack, and keeps the listener count at one", () => {
    const fakeProcess = new EventEmitter();
    const lines: string[] = [];
    installCrashGuard({ process: fakeProcess, log: (line) => lines.push(line) });

    const error = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    fakeProcess.emit("uncaughtException", error, "uncaughtException");

    expect(fakeProcess.listenerCount("uncaughtException")).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Uncaught exception");
    expect(lines[0]).toContain("EPIPE");
    expect(lines[0]).toContain("write EPIPE");
    expect(lines[0]).toContain("crash-guard.test");
  });

  it("logs an unhandled rejection, whatever was rejected", () => {
    const fakeProcess = new EventEmitter();
    const lines: string[] = [];
    installCrashGuard({ process: fakeProcess, log: (line) => lines.push(line) });

    fakeProcess.emit("unhandledRejection", new Error("feed down"), Promise.resolve());
    fakeProcess.emit("unhandledRejection", "plain text", Promise.resolve());
    fakeProcess.emit("unhandledRejection", undefined, Promise.resolve());

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Unhandled rejection");
    expect(lines[0]).toContain("feed down");
    expect(lines[1]).toContain("plain text");
    expect(lines[2]).toContain("undefined");
  });

  it("never throws from the handlers, even when logging fails", () => {
    const fakeProcess = new EventEmitter();
    installCrashGuard({
      process: fakeProcess,
      log: () => {
        throw new Error("log is broken");
      },
    });
    expect(() => fakeProcess.emit("uncaughtException", new Error("boom"), "uncaughtException")).not.toThrow();
    expect(() => fakeProcess.emit("unhandledRejection", new Error("boom"), Promise.resolve())).not.toThrow();
  });

  it("removes its handlers when asked", () => {
    const fakeProcess = new EventEmitter();
    const remove = installCrashGuard({ process: fakeProcess, log: () => {} });
    remove();
    expect(fakeProcess.listenerCount("uncaughtException")).toBe(0);
    expect(fakeProcess.listenerCount("unhandledRejection")).toBe(0);
  });
});
