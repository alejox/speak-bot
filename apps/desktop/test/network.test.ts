import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { connectionInfo, isLoopbackAddress, selectLanAddresses } from "../src/server/network";

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return { address, netmask: "255.255.255.0", family: "IPv4", mac: "00:00:00:00:00:00", internal, cidr: `${address}/24` };
}

function ipv6(address: string): NetworkInterfaceInfo {
  return { address, netmask: "ffff:ffff:ffff:ffff::", family: "IPv6", mac: "00:00:00:00:00:00", internal: false, cidr: `${address}/64`, scopeid: 0 };
}

describe("selectLanAddresses", () => {
  it("keeps external IPv4 addresses and drops loopback, IPv6 and link-local", () => {
    expect(
      selectLanAddresses({
        lo0: [ipv4("127.0.0.1", true)],
        en0: [ipv6("fe80::1"), ipv4("192.168.1.20")],
        en5: [ipv4("169.254.10.2")],
      }),
    ).toEqual(["192.168.1.20"]);
  });

  it("drops virtual adapters (Docker, VirtualBox, VMware, WSL, VPN tunnels)", () => {
    expect(
      selectLanAddresses({
        docker0: [ipv4("172.17.0.1")],
        "br-1a2b3c": [ipv4("172.18.0.1")],
        veth12ab: [ipv4("172.19.0.1")],
        vboxnet0: [ipv4("192.168.56.1")],
        vmnet8: [ipv4("192.168.200.1")],
        "vEthernet (WSL)": [ipv4("172.20.0.1")],
        utun3: [ipv4("10.8.0.2")],
        "Wi-Fi": [ipv4("192.168.0.14")],
      }),
    ).toEqual(["192.168.0.14"]);
  });

  it("lists private home-network ranges first and removes duplicates", () => {
    expect(
      selectLanAddresses({
        eth1: [ipv4("100.64.3.4")],
        eth0: [ipv4("10.0.0.5")],
        wlan0: [ipv4("192.168.1.9"), ipv4("192.168.1.9")],
      }),
    ).toEqual(["192.168.1.9", "10.0.0.5", "100.64.3.4"]);
  });

  it("returns an empty list when the computer is offline", () => {
    expect(selectLanAddresses({ lo: [ipv4("127.0.0.1", true)], en0: undefined })).toEqual([]);
  });
});

describe("connectionInfo", () => {
  it("builds the phone URLs and the OBS overlay URL for the actual port", () => {
    expect(connectionInfo(4546, { en0: [ipv4("192.168.1.20")] })).toEqual({
      port: 4546,
      lanUrls: ["http://192.168.1.20:4546/"],
      overlayUrl: "http://localhost:4546/overlay",
    });
  });
});

describe("isLoopbackAddress", () => {
  it("accepts IPv4 and IPv6 loopback, including IPv4-mapped addresses", () => {
    for (const address of ["127.0.0.1", "127.255.0.9", "::1", "::ffff:127.0.0.1"]) expect(isLoopbackAddress(address)).toBe(true);
  });

  it("rejects LAN, link-local and missing addresses", () => {
    for (const address of ["192.168.1.30", "::ffff:10.0.0.2", "fe80::1", "128.0.0.1", "", undefined]) {
      expect(isLoopbackAddress(address)).toBe(false);
    }
  });
});
