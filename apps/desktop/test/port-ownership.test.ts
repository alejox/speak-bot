import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createTcpServer, type Server as TcpServer } from "node:net";
import type { AddressInfo, Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { isPortOwnedBy } from "../src/server/port-ownership";

function healthServer(instanceId: string | undefined): Server {
  return createHttpServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, name: "speed-deck-desktop", instanceId }));
  });
}

async function listen(server: Server | TcpServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

describe("isPortOwnedBy", () => {
  const servers: (Server | TcpServer)[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      if ("closeAllConnections" in server) server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("accepts a port where our own instance answers", async () => {
    const server = healthServer("ours");
    servers.push(server);
    expect(await isPortOwnedBy(await listen(server), "ours")).toBe(true);
  });

  it("rejects a port where another instance or app answers", async () => {
    const other = healthServer("someone-else");
    const anonymous = healthServer(undefined);
    servers.push(other, anonymous);
    expect(await isPortOwnedBy(await listen(other), "ours")).toBe(false);
    expect(await isPortOwnedBy(await listen(anonymous), "ours")).toBe(false);
  });

  it("rejects a port held by something that never answers, within the timeout", async () => {
    // Holds every connection open without answering.
    const sockets: Socket[] = [];
    const silent = createTcpServer((socket) => sockets.push(socket));
    servers.push(silent);
    const port = await listen(silent);
    const started = Date.now();
    expect(await isPortOwnedBy(port, "ours", { timeoutMs: 200 })).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    for (const socket of sockets) socket.destroy();
  });

  it("accepts a port nobody is listening on over loopback", async () => {
    const server = createTcpServer();
    const port = await listen(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortOwnedBy(port, "ours")).toBe(true);
  });
});
