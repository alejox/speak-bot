import { ApplicationNotListedError, ApplicationOpenFailedError, type Application, type ApplicationLauncher } from "@speed-deck/core";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileBoardRepository } from "../src/adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "../src/adapters/json-file-settings-store";
import { createDesktopServer, type DesktopServer } from "../src/server/create-server";
import { FakeSynthesizer } from "./fake-synthesizer";

const RESOLVE = "/Applications/DaVinci Resolve/DaVinci Resolve.app";

/** A launcher that opens whatever it is told to: refusing unlisted ids is the server's job here. */
class TrustingLauncher implements ApplicationLauncher {
  apps: Application[] = [{ id: RESOLVE, name: "DaVinci Resolve" }];
  listCount = 0;
  failOpen: Error | undefined;
  readonly opened: string[] = [];
  async list() {
    this.listCount += 1;
    return this.apps;
  }
  async open(id: string) {
    if (this.failOpen) throw this.failOpen;
    this.opened.push(id);
  }
}

describe("applications API", () => {
  let dir: string;
  let server: DesktopServer;
  let baseUrl: string;
  let apps: TrustingLauncher | undefined;

  async function start(launcher: TrustingLauncher | undefined) {
    apps = launcher;
    server = createDesktopServer({
      repository: new JsonFileBoardRepository(join(dir, "boards.json")),
      settings: new JsonFileSettingsStore(join(dir, "settings.json"), { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true }),
      synthesizer: new FakeSynthesizer(),
      generateId: () => "id",
      now: () => 1,
      apps,
    });
    await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "speed-deck-apps-"));
  });

  afterEach(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  const run = (appId: unknown) =>
    fetch(`${baseUrl}/api/actions/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: { type: "system.openApp", appId } }),
    });

  it("lists the applications of the computer", async () => {
    await start(new TrustingLauncher());
    const response = await fetch(`${baseUrl}/api/applications`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: RESOLVE, name: "DaVinci Resolve" }]);
  });

  it("lists nothing where applications cannot be opened", async () => {
    await start(undefined);
    expect(await (await fetch(`${baseUrl}/api/applications`)).json()).toEqual([]);
    const response = await run(RESOLVE);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "apps-unsupported" });
  });

  it("opens an application that is listed right now", async () => {
    await start(new TrustingLauncher());
    const response = await run(RESOLVE);
    expect(response.status).toBe(200);
    expect(apps!.opened).toEqual([RESOLVE]);
    expect(apps!.listCount).toBe(1);
  });

  it.each(["/bin/sh", "/Applications/Other.app", `${RESOLVE}/Contents/MacOS/Resolve`, `${RESOLVE} --args x`, "https://example.com"])(
    "refuses %j, which is not listed, and opens nothing",
    async (appId) => {
      await start(new TrustingLauncher());
      const response = await run(appId);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "app-not-found" });
      expect(apps!.opened).toEqual([]);
    },
  );

  it("refuses an application that was listed when the key was saved but is gone now", async () => {
    const launcher = new TrustingLauncher();
    await start(launcher);
    launcher.apps = [];
    expect((await run(RESOLVE)).status).toBe(404);
    expect(launcher.opened).toEqual([]);
  });

  it("validates the shape of the id and reports a failed launch", async () => {
    const launcher = new TrustingLauncher();
    await start(launcher);
    expect((await run("")).status).toBe(400);
    expect((await run(["a"])).status).toBe(400);
    launcher.failOpen = new ApplicationOpenFailedError("open exited with code 1");
    const failed = await run(RESOLVE);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ code: "app-open-failed" });
    launcher.failOpen = new ApplicationNotListedError();
    expect((await run(RESOLVE)).status).toBe(404);
  });
});
