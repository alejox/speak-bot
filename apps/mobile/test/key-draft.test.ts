import { describe, expect, it } from "vitest";
import { draftOf, draftToKey } from "../src/app/key-draft";
import { translate } from "../src/i18n/messages";

const t = (key: Parameters<typeof translate>[1]) => translate("en", key);

describe("key drafts", () => {
  it("round-trips an existing key", () => {
    const key = { slot: 3, label: "Hi", icon: "smile", color: "#ff0000", action: { type: "voice.speak" as const, text: "Hello" } };
    expect(draftToKey(3, draftOf(key), t)).toEqual({ ok: true, key: { ...key, color: "#ff0000" } });
  });

  it("keeps the label but not the parameters when another action is chosen", () => {
    const key = { slot: 0, label: "Hi", action: { type: "voice.speak" as const, text: "Hello" } };
    expect(draftOf(key, "obs.switchScene")).toEqual({ label: "Hi", icon: "", color: "", activeColor: "", actionType: "obs.switchScene", params: {} });
  });

  it("explains missing actions, parameters, bad numbers and bad colors", () => {
    const empty = draftOf(undefined);
    expect(draftToKey(0, empty, t)).toMatchObject({ ok: false, error: { key: "editor.actionRequired" } });
    expect(draftToKey(0, { ...empty, actionType: "voice.speak", params: { text: "   " } }, t)).toMatchObject({
      ok: false,
      error: { key: "editor.paramRequired", params: { field: "Text to say" } },
      field: "text",
    });
    expect(draftToKey(0, { ...empty, actionType: "nav.goToPage", params: { page: "0" } }, t)).toMatchObject({
      ok: false,
      error: { key: "editor.numberRange", params: { field: "Page", min: 1, max: 100 } },
    });
    expect(draftToKey(0, { ...empty, color: "red", actionType: "voice.stop" }, t)).toMatchObject({ ok: false, error: { key: "editor.colorInvalid" } });
  });

  it("builds typed actions, trimming text and lowercasing colors", () => {
    expect(draftToKey(2, { label: " ", icon: "", color: "#AABBCC", activeColor: "", actionType: "nav.goToPage", params: { page: "2" } }, t)).toEqual({
      ok: true,
      key: { slot: 2, label: "", icon: "", color: "#aabbcc", action: { type: "nav.goToPage", page: 2 } },
    });
  });

  it("keeps a colour for when on only for actions with an on state", () => {
    const draft = { label: "", icon: "", color: "", activeColor: "#AA0000", params: {} };
    expect(draftToKey(0, { ...draft, actionType: "obs.toggleRecord" }, t)).toMatchObject({ ok: true, key: { activeColor: "#aa0000" } });
    const stateless = draftToKey(0, { ...draft, actionType: "voice.stop" }, t);
    expect(stateless.ok && "activeColor" in stateless.key).toBe(false);
    expect(draftToKey(0, { ...draft, activeColor: "red", actionType: "obs.toggleRecord" }, t)).toMatchObject({ ok: false, field: "activeColor" });
  });
});
