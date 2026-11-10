import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installQuitOnSignals } from "../src/quit-signals";

function fakeProcess() {
  return new EventEmitter() as EventEmitter & Pick<NodeJS.Process, "on" | "off">;
}

describe("installQuitOnSignals", () => {
  afterEach(() => vi.useRealTimers());

  it("quits cleanly on SIGTERM and SIGINT", () => {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      const process = fakeProcess();
      const quit = vi.fn();
      const exit = vi.fn();
      installQuitOnSignals({ process, quit, exit });
      process.emit(signal);
      expect(quit).toHaveBeenCalledTimes(1);
      expect(exit).not.toHaveBeenCalled();
    }
  });

  it("exits when the clean quit takes too long or a second signal arrives", () => {
    vi.useFakeTimers();
    const process = fakeProcess();
    const quit = vi.fn();
    const exit = vi.fn();
    installQuitOnSignals({ process, quit, exit, timeoutMs: 5000 });
    process.emit("SIGTERM");
    vi.advanceTimersByTime(4999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(0);

    const other = fakeProcess();
    const otherExit = vi.fn();
    installQuitOnSignals({ process: other, quit: vi.fn(), exit: otherExit });
    other.emit("SIGINT");
    other.emit("SIGINT");
    expect(otherExit).toHaveBeenCalledWith(0);
  });

  it("stops listening when uninstalled", () => {
    const process = fakeProcess();
    const quit = vi.fn();
    const uninstall = installQuitOnSignals({ process, quit, exit: vi.fn() });
    uninstall();
    process.emit("SIGTERM");
    expect(quit).not.toHaveBeenCalled();
  });
});
