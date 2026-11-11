import { describe, expect, it } from "vitest";
import { computerDisplayName, desktopAnnouncement } from "../../src/discovery/desktop-announcement";

describe("desktopAnnouncement", () => {
  it("announces _speeddeck._tcp on the port with the id, name and protocol version", () => {
    const announcement = desktopAnnouncement({
      desktopId: "0f8e2c1a-1111-2222-3333-444455556666",
      displayName: "Studio Mac",
      port: 4546,
    });

    expect(announcement).toEqual({
      type: "speeddeck",
      name: "Studio Mac (0f8e2c)",
      port: 4546,
      txt: { id: "0f8e2c1a-1111-2222-3333-444455556666", name: "Studio Mac", v: "1" },
    });
  });

  it("keeps the instance name within the DNS label limit", () => {
    const announcement = desktopAnnouncement({ desktopId: "abcdef12", displayName: "x".repeat(100), port: 4545 });

    expect(Buffer.byteLength(announcement.name, "utf8")).toBeLessThanOrEqual(63);
    expect(announcement.name.endsWith(" (abcdef)")).toBe(true);
  });
});

describe("computerDisplayName", () => {
  it("drops the local domain from the host name", () => {
    expect(computerDisplayName("Alejos-MacBook-Pro.local")).toBe("Alejos-MacBook-Pro");
    expect(computerDisplayName("desk.home.lan")).toBe("desk");
  });

  it("falls back to a generic name when the host name is empty", () => {
    expect(computerDisplayName("")).toBe("Speed Deck");
  });
});
