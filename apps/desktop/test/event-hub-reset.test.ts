import { createServer, type Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventHub } from "../src/server/event-hub";
import { createRequestGuard } from "../src/server/request-guard";

const REFUSED_UPGRADE =
  "GET /ws HTTP/1.1\r\nHost: evil.example:4545\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
  "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
const WRONG_PATH_UPGRADE = REFUSED_UPGRADE.replace("GET /ws ", "GET /elsewhere ").replace("evil.example:4545", "127.0.0.1");

/** Sends an upgrade request and resets the TCP connection as soon as the bytes left. */
function upgradeThenReset(port: number, payload: string): Promise<void> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(payload, () => {
        socket.resetAndDestroy();
        setTimeout(resolve, 5);
      });
    });
    socket.on("error", () => resolve());
  });
}

describe("EventHub refused upgrades", () => {
  let server: Server;
  let hub: EventHub;
  let port: number;
  const uncaught: string[] = [];
  const record = (error: Error) => uncaught.push(`${(error as NodeJS.ErrnoException).code ?? ""} ${error.message}`);

  beforeEach(async () => {
    uncaught.length = 0;
    process.on("uncaughtException", record);
    hub = new EventHub(createRequestGuard({ hostname: "test-machine" }));
    server = createServer((_request, response) => response.end("ok"));
    hub.attach(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    process.off("uncaughtException", record);
    await hub.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("does not raise when a refused upgrade is followed by a TCP reset", async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) await upgradeThenReset(port, REFUSED_UPGRADE);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(uncaught).toEqual([]);
  });

  it("does not raise when an upgrade for another path is followed by a TCP reset", async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) await upgradeThenReset(port, WRONG_PATH_UPGRADE);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(uncaught).toEqual([]);
  });

  it("still answers 403 to a refused upgrade that stays connected", async () => {
    const answer = await new Promise<string>((resolve) => {
      let received = "";
      const socket = connect(port, "127.0.0.1", () => socket.write(REFUSED_UPGRADE));
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => (received += chunk));
      socket.on("close", () => resolve(received));
      socket.on("error", () => resolve(received));
    });
    expect(answer.startsWith("HTTP/1.1 403 Forbidden")).toBe(true);
  });
});
