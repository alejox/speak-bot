/** A DNS-SD service to announce on the local network, e.g. `_speeddeck._tcp`. */
export interface ServiceAnnouncement {
  /** Service type without underscores or protocol: "speeddeck" becomes `_speeddeck._tcp`. */
  type: string;
  /** Instance name; unique on the network. */
  name: string;
  port: number;
  txt: Readonly<Record<string, string>>;
}

export interface Advertisement {
  /** Withdraws the announcement. Safe to call more than once. */
  stop(): Promise<void>;
}

/** Port for announcing services on the LAN (multicast DNS in production, a fake in tests). */
export interface ServiceAdvertiser {
  advertise(announcement: ServiceAnnouncement): Advertisement;
}
