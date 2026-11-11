import { describe, expect, it } from "vitest";
import { externalLinkPolicy } from "../src/external-links";

const ORIGIN = "http://127.0.0.1:4545";

describe("externalLinkPolicy", () => {
  const policy = externalLinkPolicy(ORIGIN);

  it("stays in the app for its own pages", () => {
    expect(policy.navigate(`${ORIGIN}/`)).toEqual({ allow: true });
    expect(policy.navigate(`${ORIGIN}/dock#settings`)).toEqual({ allow: true });
  });

  it("opens https links in the system browser and never inside the app", () => {
    expect(policy.navigate("https://sponsor.example/offer?x=1")).toEqual({ allow: false, openExternal: "https://sponsor.example/offer?x=1" });
    expect(policy.open("https://store.example/buy")).toEqual({ allow: false, openExternal: "https://store.example/buy" });
  });

  it("opens nothing that is not https", () => {
    for (const url of ["http://sponsor.example/", "mailto:a@example.com", "file:///etc/passwd", "javascript:alert(1)", "smb://share/x", "not a url"]) {
      expect(policy.navigate(url)).toEqual({ allow: false });
      expect(policy.open(url)).toEqual({ allow: false });
    }
  });

  it("never opens new windows, not even for the app's own pages", () => {
    expect(policy.open(`${ORIGIN}/`)).toEqual({ allow: false });
  });

  it("treats another port on loopback as another site", () => {
    expect(policy.navigate("http://127.0.0.1:9999/")).toEqual({ allow: false });
  });
});
