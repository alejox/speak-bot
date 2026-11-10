import { describe, expect, it } from "vitest";
import { candidatePorts, listenWithFallback } from "../src/server/port-fallback";

function addressInUse(): NodeJS.ErrnoException {
  return Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });
}

describe("candidatePorts", () => {
  it("tries the preferred port and then the next ones", () => {
    expect(candidatePorts(4545, 4)).toEqual([4545, 4546, 4547, 4548]);
  });

  it("never goes past the last valid port", () => {
    expect(candidatePorts(65534, 5)).toEqual([65534, 65535]);
  });

  it("tries only once for an ephemeral port (0)", () => {
    expect(candidatePorts(0, 10)).toEqual([0]);
  });
});

describe("listenWithFallback", () => {
  it("returns the first port that is free", async () => {
    const tried: number[] = [];
    const port = await listenWithFallback(
      async (candidate) => {
        tried.push(candidate);
        if (candidate < 4547) throw addressInUse();
      },
      { port: 4545, attempts: 10 },
    );
    expect(port).toBe(4547);
    expect(tried).toEqual([4545, 4546, 4547]);
  });

  it("does not retry on errors other than a busy port", async () => {
    const denied = Object.assign(new Error("listen EACCES"), { code: "EACCES" });
    const tried: number[] = [];
    await expect(
      listenWithFallback(
        async (candidate) => {
          tried.push(candidate);
          throw denied;
        },
        { port: 80, attempts: 10 },
      ),
    ).rejects.toBe(denied);
    expect(tried).toEqual([80]);
  });

  it("explains which ports were busy when all of them are", async () => {
    await expect(
      listenWithFallback(
        async () => {
          throw addressInUse();
        },
        { port: 4545, attempts: 3 },
      ),
    ).rejects.toThrow("Ports 4545–4547 are all in use.");
  });
});

describe("listenWithFallback with an ownership check", () => {
  it("releases a port another app still answers on and moves to the next one", async () => {
    const released: number[] = [];
    const port = await listenWithFallback(async () => {}, {
      port: 4545,
      attempts: 10,
      isOwned: async (candidate) => candidate !== 4545,
      release: async (candidate) => {
        released.push(candidate);
      },
    });
    expect(port).toBe(4546);
    expect(released).toEqual([4545]);
  });

  it("reports the ports as in use when another app answers on all of them", async () => {
    await expect(
      listenWithFallback(async () => {}, { port: 4545, attempts: 2, isOwned: async () => false, release: async () => {} }),
    ).rejects.toThrow("Ports 4545–4546 are all in use.");
  });
});
