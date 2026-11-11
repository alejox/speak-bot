import { describe, expect, it } from "vitest";
import {
  CONNECTION_LOST_AFTER_MS,
  CONNECTION_RESTORED_FOR_MS,
  INITIAL_CONNECTION_SIGNAL,
  stepConnectionSignal,
  type ConnectionEvent,
  type ConnectionSignalState,
  type ConnectionSignal,
} from "../src/app/connection-signal";

/** Runs the events in order and collects every signal and the final state. */
function run(events: ConnectionEvent[], from: ConnectionSignalState = INITIAL_CONNECTION_SIGNAL) {
  let state = from;
  const signals: ConnectionSignal[] = [];
  let wakeAt: number | null = null;
  for (const event of events) {
    const step = stepConnectionSignal(state, event);
    state = step.state;
    wakeAt = step.wakeAt;
    if (step.signal) signals.push(step.signal);
  }
  return { state, signals, wakeAt };
}

const up = (at: number): ConnectionEvent => ({ type: "up", at });
const down = (at: number): ConnectionEvent => ({ type: "down", at });
const tick = (at: number): ConnectionEvent => ({ type: "tick", at });

describe("the disconnect signal", () => {
  it("stays quiet while the app is still looking for the computer the first time", () => {
    const { state, signals, wakeAt } = run([down(0), tick(10_000), down(20_000), tick(60_000)]);
    expect(signals).toEqual([]);
    expect(state.banner).toBe("none");
    expect(wakeAt).toBeNull();
  });

  it("stays quiet when the first connection opens", () => {
    const { state, signals } = run([up(0), tick(5_000)]);
    expect(signals).toEqual([]);
    expect(state.banner).toBe("none");
  });

  it("signals a loss only after it lasted long enough", () => {
    const lost = run([up(0), down(1_000)]);
    expect(lost.signals).toEqual([]);
    expect(lost.wakeAt).toBe(1_000 + CONNECTION_LOST_AFTER_MS);
    expect(run([tick(1_000 + CONNECTION_LOST_AFTER_MS - 1)], lost.state).signals).toEqual([]);

    const signalled = run([tick(1_000 + CONNECTION_LOST_AFTER_MS)], lost.state);
    expect(signalled.signals).toEqual(["lost"]);
    expect(signalled.state.banner).toBe("lost");
    expect(signalled.wakeAt).toBeNull();
  });

  it("ignores a flap shorter than the debounce", () => {
    const { state, signals } = run([up(0), down(1_000), up(2_000), tick(1_000 + CONNECTION_LOST_AFTER_MS + 1), tick(30_000)]);
    expect(signals).toEqual([]);
    expect(state.banner).toBe("none");
  });

  it("signals the loss once, however many reconnection attempts fail", () => {
    const { signals } = run([up(0), down(1_000), tick(4_000), down(5_000), tick(9_000), down(20_000), tick(40_000)]);
    expect(signals).toEqual(["lost"]);
  });

  it("signals the return and shows it for a while, then hides the banner", () => {
    const lost = run([up(0), down(1_000), tick(4_000)]);
    const back = run([up(10_000)], lost.state);
    expect(back.signals).toEqual(["restored"]);
    expect(back.state.banner).toBe("restored");
    expect(back.wakeAt).toBe(10_000 + CONNECTION_RESTORED_FOR_MS);

    expect(run([tick(10_000 + CONNECTION_RESTORED_FOR_MS - 1)], back.state).state.banner).toBe("restored");
    const hidden = run([tick(10_000 + CONNECTION_RESTORED_FOR_MS)], back.state);
    expect(hidden.state.banner).toBe("none");
    expect(hidden.signals).toEqual([]);
    expect(hidden.wakeAt).toBeNull();
  });

  it("signals a new loss right after a return, once it lasted long enough", () => {
    const back = run([up(0), down(1_000), tick(4_000), up(10_000)]);
    const again = run([down(11_000), tick(11_000 + CONNECTION_LOST_AFTER_MS)], back.state);
    expect(again.signals).toEqual(["lost"]);
    expect(again.state.banner).toBe("lost");
  });

  it("repeats nothing when the same state is reported twice", () => {
    const { signals } = run([up(0), up(1_000), down(2_000), down(3_000), tick(10_000), up(11_000), up(12_000)]);
    expect(signals).toEqual(["lost", "restored"]);
  });
});
