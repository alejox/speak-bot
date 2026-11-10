import type { NetworkInterfaceInfo } from "node:os";

/** What the computer shows so a phone can connect and OBS can load the captions. */
export interface ConnectionInfo {
  port: number;
  /** URLs a phone on the same network can open, best guess first. */
  lanUrls: string[];
  /** Browser Source URL for OBS on this computer. */
  overlayUrl: string;
  /**
   * Custom Browser Dock URL for OBS: the app's compact view. IPv4 loopback, because `localhost`
   * may resolve to [::1] where another app could hold the same port.
   */
  dockUrl: string;
}

export type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

/** Adapters created by Docker, VMs, WSL and VPNs: phones on the Wi-Fi cannot reach them. */
const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|vboxnet|vmnet|vnic|utun|tun|tap|awdl|llw|bridge|zt|wg|ham)|vethernet|virtualbox|vmware|hyper-v|loopback/i;

/**
 * Picks the IPv4 addresses a phone on the same network can most likely reach.
 * Drops loopback, link-local (169.254.x.x) and virtual adapters; lists home-network
 * ranges (192.168.x.x, then 10.x.x.x, then 172.16–31.x.x) before anything else.
 */
export function selectLanAddresses(interfaces: NetworkInterfaces): string[] {
  const addresses = new Set<string>();
  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries || VIRTUAL_INTERFACE.test(name)) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal || entry.address.startsWith("169.254.")) continue;
      addresses.add(entry.address);
    }
  }
  return [...addresses].sort((a, b) => rank(a) - rank(b));
}

function rank(address: string): number {
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  const [first, second] = address.split(".").map(Number);
  if (first === 172 && second !== undefined && second >= 16 && second <= 31) return 2;
  return 3;
}

export function connectionInfo(port: number, interfaces: NetworkInterfaces): ConnectionInfo {
  return {
    port,
    lanUrls: selectLanAddresses(interfaces).map((address) => `http://${address}:${port}/`),
    overlayUrl: `http://localhost:${port}/overlay`,
    dockUrl: `http://127.0.0.1:${port}/dock`,
  };
}

/** True for a client on this computer: 127.0.0.0/8, ::1, or IPv4 loopback mapped into IPv6. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const ipv4 = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  return /^127(\.\d{1,3}){3}$/.test(ipv4) || address === "::1" || address === "0:0:0:0:0:0:0:1";
}
