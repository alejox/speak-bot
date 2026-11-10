import { makeBoard, type Action, type Key } from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import { keyLabel, keyRole, keyShownIconId, presentKey, type KeyContext } from "../src/app/key-presentation";
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

  it("marks the captions key on while captions are visible, and swaps its icon while they are hidden", () => {
    expect(presentKey({ type: "captions.toggle" }, remote)).toEqual({ pressed: false, iconId: "captions-off" });
    expect(presentKey({ type: "captions.toggle" }, { ...remote, captionsVisible: true })).toEqual({ pressed: true, state: "on" });
  });

  it("names the live state of a toggle that is on, and none while it is off", () => {
    expect(presentKey({ type: "obs.toggleStream" }, remote).state).toBe("live");
    expect(presentKey({ type: "obs.toggleRecord" }, { ...remote, obs: { ...remote.obs!, state: { ...LIVE, recording: true } } }).state).toBe("recording");
    expect(presentKey({ type: "obs.toggleRecord" }, remote).state).toBeUndefined();
    expect(presentKey({ type: "obs.toggleMute", inputName: "Mic" }, remote)).toEqual({ pressed: true, state: "muted", iconId: "mic-off" });
    expect(presentKey({ type: "obs.toggleMute", inputName: "Desktop" }, remote)).toEqual({ pressed: false });
    expect(presentKey({ type: "obs.switchScene", sceneName: "Main" }, remote).state).toBe("scene");
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

describe("keyRole", () => {
  it("tells phrases, commands and navigation apart", () => {
    expect(keyRole({ type: "voice.speak", text: "Hi" })).toBe("phrase");
    for (const type of ["voice.stop", "voice.repeat", "voice.toggleLanguage", "captions.clear", "captions.toggle", "obs.toggleStream"] as const) expect(keyRole({ type }), type).toBe("command");
    expect(keyRole({ type: "obs.switchScene", sceneName: "Main" })).toBe("command");
    expect(keyRole({ type: "nav.nextPage" })).toBe("navigation");
    expect(keyRole({ type: "nav.goToBoard", boardId: "games" })).toBe("navigation");
  });
});

describe("keyShownIconId", () => {
  it("is the icon the person chose, otherwise the action's, and none for a phrase", () => {
    expect(keyShownIconId(key({ type: "voice.speak", text: "Hi" }))).toBeUndefined();
    expect(keyShownIconId({ ...key({ type: "voice.speak", text: "Hi" }), icon: "heart" })).toBe("heart");
    expect(keyShownIconId(key({ type: "voice.stop" }))).toBe("stop");
    expect(keyShownIconId(key({ type: "obs.toggleMute", inputName: "Mic" }), "mic-off")).toBe("mic-off");
    expect(keyShownIconId({ ...key({ type: "obs.toggleMute", inputName: "Mic" }), icon: "star" }, "mic-off")).toBe("star");
  });
});
