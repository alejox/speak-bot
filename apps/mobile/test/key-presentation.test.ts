import { makeBoard, type Action, type Key } from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import { hasOnState, keyLabel, keyLabelLength, keyRole, keyShownIconId, presentKey, type KeyContext } from "../src/app/key-presentation";
import { translate } from "../src/i18n/messages";

const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate("en", key, params);
const boards = [makeBoard("main", "Main", "voice"), makeBoard("games", "Games", "voice")];
const LIVE = { currentScene: "Main", mutedInputs: ["Mic"], streaming: true, recording: false };

const remote: KeyContext = {
  isConnected: true,
  obs: { enabled: true, status: "connected", state: LIVE },
  captionsVisible: false,
  voiceLanguage: "es",
  boards,
};
const local: KeyContext = { ...remote, isConnected: false, obs: null, captionsVisible: null };

const key = (action: Action, label?: string): Key => ({ slot: 0, ...(label ? { label } : {}), action });

describe("presentKey", () => {
  it("shows OBS state on toggle keys while connected", () => {
    // Mic is muted, so its key is off; Desktop is heard, so its key is on.
    expect(presentKey({ type: "obs.toggleMute", inputName: "Mic" }, remote).pressed).toBe(false);
    expect(presentKey({ type: "obs.toggleMute", inputName: "Desktop" }, remote).pressed).toBe(true);
    expect(presentKey({ type: "obs.toggleStream" }, remote).pressed).toBe(true);
    expect(presentKey({ type: "obs.toggleRecord" }, remote).pressed).toBe(false);
    expect(presentKey({ type: "obs.switchScene", sceneName: "Main" }, remote).pressed).toBe(true);
    expect(presentKey({ type: "obs.switchScene", sceneName: "BRB" }, remote).pressed).toBe(false);
  });

  it("marks a monitor key on while OBS monitors its input, and keeps it plain on an older desktop", () => {
    const monitoring: KeyContext = { ...remote, obs: { ...remote.obs!, state: { ...LIVE, monitoredInputs: ["Mic"] } } };
    expect(presentKey({ type: "obs.toggleMonitor", inputName: "Mic" }, monitoring)).toEqual({ pressed: true, state: "on" });
    expect(presentKey({ type: "obs.toggleMonitor", inputName: "Desktop" }, monitoring)).toEqual({ pressed: false });
    expect(presentKey({ type: "obs.toggleMonitor", inputName: "Mic" }, remote)).toEqual({});
    expect(hasOnState("obs.toggleMonitor")).toBe(true);
    expect(keyLabel(key({ type: "obs.toggleMonitor", inputName: "Mic" }), boards, t)).toBe("Mic");
  });

  it("marks the captions key on while captions are visible, and swaps its icon while they are hidden", () => {
    expect(presentKey({ type: "captions.toggle" }, remote)).toEqual({ pressed: false, iconId: "captions-off" });
    expect(presentKey({ type: "captions.toggle" }, { ...remote, captionsVisible: true })).toEqual({ pressed: true, state: "on" });
  });

  it("names the live state of a toggle that is on, and none while it is off", () => {
    expect(presentKey({ type: "obs.toggleStream" }, remote).state).toBe("live");
    expect(presentKey({ type: "obs.toggleRecord" }, { ...remote, obs: { ...remote.obs!, state: { ...LIVE, recording: true } } }).state).toBe("recording");
    expect(presentKey({ type: "obs.toggleRecord" }, remote).state).toBeUndefined();
    // A mute key is "on" while its input is heard: muted is off (the off colour, a crossed-out mic).
    expect(presentKey({ type: "obs.toggleMute", inputName: "Mic" }, remote)).toEqual({ pressed: false, state: "muted", iconId: "mic-off" });
    expect(presentKey({ type: "obs.toggleMute", inputName: "Desktop" }, remote)).toEqual({ pressed: true, state: "on" });
    expect(presentKey({ type: "obs.switchScene", sceneName: "Main" }, remote).state).toBe("scene");
  });

  it("shows whether a source is visible on its show/hide key, and nothing while that is unknown", () => {
    const action: Action = { type: "obs.toggleSourceVisibility", sceneName: "Main", sourceName: "Cam" };
    const withHidden = (hiddenSources: Array<{ sceneName: string; sourceName: string }>): KeyContext => ({
      ...remote,
      obs: { ...remote.obs!, state: { ...LIVE, hiddenSources } },
    });
    expect(presentKey(action, withHidden([]))).toEqual({ pressed: true, state: "on" });
    expect(presentKey(action, withHidden([{ sceneName: "BRB", sourceName: "Cam" }]))).toEqual({ pressed: true, state: "on" });
    expect(presentKey(action, withHidden([{ sceneName: "Main", sourceName: "Cam" }]))).toEqual({ pressed: false, iconId: "eye-off" });
    expect(presentKey(action, remote)).toEqual({});
  });

  it("offers an on colour for the show/hide source key", () => {
    expect(hasOnState("obs.toggleSourceVisibility")).toBe(true);
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

  it("names a key without a label with a short default that fits, never the long action name", () => {
    const es = (messageKey: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate("es", messageKey, params);
    const shortNames = [
      ["obs.toggleStream", "Stream", "Transmitir"],
      ["obs.toggleRecord", "Record", "Grabar"],
      ["captions.toggle", "Captions", "Subtítulos"],
      ["captions.clear", "Clear caption", "Limpiar subtítulo"],
      ["voice.toggleLanguage", "Voice language", "Idioma de voz"],
      ["voice.stop", "Stop voice", "Detener voz"],
      ["voice.repeat", "Repeat", "Repetir"],
    ] as const;
    for (const [type, english, spanish] of shortNames) {
      expect(keyLabel(key({ type }), boards, t), type).toBe(english);
      expect(keyLabel(key({ type }), boards, es), type).toBe(spanish);
    }
  });

  it("keeps a saved label as it is", () => {
    expect(keyLabel(key({ type: "obs.toggleStream" }, "Start or stop stream"), boards, t)).toBe("Start or stop stream");
  });
});

describe("keyLabelLength", () => {
  it("steps long labels down: up to 14 characters normal, then long, past 28 longer", () => {
    expect(keyLabelLength("")).toBeUndefined();
    expect(keyLabelLength("Subtítulos")).toBeUndefined();
    expect(keyLabelLength("a".repeat(14))).toBeUndefined();
    expect(keyLabelLength("a".repeat(15))).toBe("long");
    expect(keyLabelLength("Un momento, por favor")).toBe("long");
    expect(keyLabelLength("a".repeat(28))).toBe("long");
    expect(keyLabelLength("a".repeat(29))).toBe("longer");
    expect(keyLabelLength("No puedo hablar, pero te escucho")).toBe("longer");
  });

  it("counts characters, not UTF-16 units, and ignores surrounding spaces", () => {
    expect(keyLabelLength("👋".repeat(14))).toBeUndefined();
    expect(keyLabelLength(`  ${"a".repeat(14)}  `)).toBeUndefined();
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
