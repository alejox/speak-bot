import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { computerDisplayName } from "../../discovery/desktop-announcement";

/**
 * The name the user gave this computer: the macOS "Computer Name" (e.g. "Alejo's MacBook Pro"),
 * otherwise the host name without its domain.
 */
export async function readComputerName(platform: NodeJS.Platform = process.platform): Promise<string> {
  if (platform === "darwin") {
    const name = await new Promise<string>((resolve) => {
      execFile("scutil", ["--get", "ComputerName"], { timeout: 2000 }, (error, stdout) => resolve(error ? "" : stdout.trim()));
    });
    if (name !== "") return name;
  }
  return computerDisplayName(hostname());
}
