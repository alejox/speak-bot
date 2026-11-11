import { Bonjour } from "bonjour-service";
import type { EventEmitter } from "node:events";
import type { Advertisement, ServiceAdvertiser, ServiceAnnouncement } from "../../discovery/service-advertiser";

const STOP_TIMEOUT_MS = 1000;

/**
 * Announces services with multicast DNS (pure JavaScript, so it works the same on macOS,
 * Windows and Linux). Network errors are logged and never stop the server.
 */
export function createBonjourAdvertiser(log: (message: string) => void): ServiceAdvertiser {
  return {
    advertise(announcement: ServiceAnnouncement): Advertisement {
      let bonjour: Bonjour;
      try {
        const report = (error: unknown) => log(`Network discovery: ${String(error)}`);
        bonjour = new Bonjour({}, report);
        // The multicast socket emits "error" (port 5353 unavailable) with no listener attached,
        // which would crash the process.
        const socket = (bonjour as unknown as { server?: { mdns?: EventEmitter } }).server?.mdns;
        socket?.on("error", report);
        socket?.on("warning", () => {});
        bonjour.publish({
          type: announcement.type,
          name: announcement.name,
          port: announcement.port,
          txt: { ...announcement.txt },
        });
      } catch (error) {
        log(`Network discovery is not available: ${String(error)}`);
        return { stop: async () => {} };
      }

      let stopping: Promise<void> | undefined;
      return {
        stop: () => {
          stopping ??= new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve();
            };
            // Never hold up quitting the app if the network does not answer.
            const timer = setTimeout(() => {
              bonjour.destroy();
              finish();
            }, STOP_TIMEOUT_MS);
            timer.unref();
            // Sends the goodbye packets, then closes the multicast socket.
            bonjour.unpublishAll(() => bonjour.destroy(finish));
          });
          return stopping;
        },
      };
    },
  };
}
