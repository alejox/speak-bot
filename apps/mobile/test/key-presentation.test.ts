import { makeBoard, type Action, type Key } from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import { keyLabel, presentKey, type KeyContext } from "../src/app/key-presentation";
import { translate } from "../src/i18n/messages";

const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate("en", key, params);
const boards = [makeBoard("main", "Main", "voice"), makeBoard("games", "Games", "voice")];
const LIVE = { currentScene: "Main", mutedInputs: ["Mic"], streaming: true, recording: false };

const remote: KeyContext = {
  isRemote: true,
  obs: { enabled: true, status: "connected", state: LIVE },
  captionsVisible: false,
  voiceLanguage: "es",
  boards,
};
const local: KeyContext = { ...remote, isRemote: false, obs: null, captionsVisible: null };

const key = (action: Action, label?: string): Key => ({ slot: 0, ...(label ? { label } : {}), action });

describe("presentKey", () => {
  it("shows OBS state on toggle keys while connected", () => {
    expect(presentKey({ type: "obs.toggleMute", inputName: "Mic" }, remote).pressed).toBe(true);
    expect(presentKey({ type: "obs.toggleMute", inputName: "Desktop" }, remote).pressed).toBe(false);
    expect(presentKey({ type: "obs.toggleStream" }, remote).pressed).toBe(true);
    expect(presentKey({ type: "obs.toggleRecord" }, remote).pressed).toBe(false);
    expect(presentKey({ type: "obs.switchScene", sceneName: "Main" }, remote).pressed).toBe(true);
    expect(presentKey({ type: "obs.switchScene", sceneName: "BRB" }, remote).pressed).toBe(false);
  });

  it("marks the captions key pressed while captions are hidden", () => {
    expect(presentKey({ type: "captions.toggle" }, remote).pressed).toBe(true);
    expect(presentKey({ type: "captions.toggle" }, { ...remote, captionsVisible: true }).pressed).toBe(false);
  });

  it("shows the current voice language on the language key", () => {
    expect(presentKey({ type: "voice.toggleLanguage" }, remote).detail).toEqual({ key: "key.currentVoice", params: { language: "Español" } });
  });

  it("disables desktop keys in phone-only mode and OBS keys while OBS is not connected, saying why", () => {
    expect(presentKey({ type: "captions.clear" }, local).disabledReason).toBe("key.needsComputer");
    expect(presentKey({ type: "obs.toggleStream" }, local).disabledReason).toBe("key.needsComputer");
    expect(presentKey({ type: "voice.speak", text: "Hi" }, local).disabledReason).toBeUndefined();
    const disconnected = { ...remote, obs: { enabled: true, status: "error" as const, state: LIVE } };
    expect(presentKey({ type: "obs.toggleStream" }, disconnected)).toEqual({ disabledReason: "key.obsDisconnected" });
    expect(presentKey({ type: "obs.toggleStream" }, { ...remote, obs: { ...disconnected.obs, enabled: false } }).disabledReason).toBe("key.obsDisabled");
  });

  it("disables a key that opens a board that no longer exists", () => {
    expect(presentKey({ type: "nav.goToBoard", boardId: "gone" }, remote).disabledReason).toBe("key.boardMissing");
    expect(presentKey({ type: "nav.goToBoard", boardId: "games" }, local).disabledReason).toBeUndefined();
  });
});

describe("keyLabel", () => {
  it("is the label when there is one, otherwise what the action does", () => {
    expect(keyLabel(key({ type: "voice.speak", text: "Thank you very much" }, "Thanks"), boards, t)).toBe("Thanks");
    expect(keyLabel(key({ type: "voice.speak", text: "Thank you very much" }), boards, t)).toBe("Thank you very much");
    expect(keyLabel(key({ type: "voice.stop" }), boards, t)).toBe("Stop voice");
    expect(keyLabel(key({ type: "obs.switchScene", sceneName: "BRB" }), boards, t)).toBe("BRB");
    expect(keyLabel(key({ type: "nav.goToPage", page: 3 }), boards, t)).toBe("Page 3");
    expect(keyLabel(key({ type: "nav.goToBoard", boardId: "games" }), boards, t)).toBe("Games");
  });
});
