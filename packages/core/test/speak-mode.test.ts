import { describe, expect, it } from "vitest";
import { isSpeakMode, MAX_SPEECH_QUEUE, speakText, SpeechQueueFullError } from "../src";
import { FakeSpeechSynthesizer } from "./fakes";

describe("speak mode", () => {
  it("carries the mode to the synthesizer and leaves it out by default (interrupt)", async () => {
    const synthesizer = new FakeSpeechSynthesizer();
    await speakText(synthesizer, " Wait for me ", { mode: "queue" });
    await speakText(synthesizer, "Now");
    expect(synthesizer.spoken).toEqual([
      { text: "Wait for me", options: { mode: "queue" } },
      { text: "Now", options: undefined },
    ]);
  });

  it("knows its two modes and bounds the queue", () => {
    expect(["queue", "interrupt", "later", undefined, 1].map(isSpeakMode)).toEqual([true, true, false, false, false]);
    expect(MAX_SPEECH_QUEUE).toBe(20);
    expect(new SpeechQueueFullError()).toMatchObject({ name: "SpeechQueueFullError" });
  });
});
