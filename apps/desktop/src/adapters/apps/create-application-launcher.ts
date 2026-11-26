import { ApplicationsUnsupportedError, type Application, type ApplicationLauncher } from "@speed-deck/core";
import { MacApplicationLauncher } from "./mac-application-launcher";
import { WindowsApplicationLauncher } from "./windows-application-launcher";

/** Systems where applications cannot be listed or opened yet (Linux): nothing to choose, nothing opened. */
class UnsupportedApplicationLauncher implements ApplicationLauncher {
  async list(): Promise<Application[]> {
    return [];
  }

  async open(): Promise<void> {
    throw new ApplicationsUnsupportedError();
  }
}

export function createApplicationLauncher(platform: NodeJS.Platform = process.platform): ApplicationLauncher {
  if (platform === "darwin") return new MacApplicationLauncher();
  if (platform === "win32") return new WindowsApplicationLauncher();
  return new UnsupportedApplicationLauncher();
}
