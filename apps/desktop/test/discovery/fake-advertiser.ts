import type { ServiceAdvertiser, ServiceAnnouncement } from "../../src/discovery/service-advertiser";

/** Records what would be announced on the network instead of using multicast DNS. */
export class FakeAdvertiser implements ServiceAdvertiser {
  readonly advertised: ServiceAnnouncement[] = [];
  readonly stopped: ServiceAnnouncement[] = [];

  advertise(announcement: ServiceAnnouncement) {
    this.advertised.push(announcement);
    return {
      stop: async () => {
        this.stopped.push(announcement);
      },
    };
  }
}
