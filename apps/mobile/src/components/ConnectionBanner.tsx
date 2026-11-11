import { Wifi, WifiOff } from "lucide-react";
import type { ConnectionBanner as Banner } from "../app/connection-signal";
import { useT } from "../i18n/I18nProvider";

interface ConnectionBannerProps {
  banner: Banner;
  /** The computer's name, when the device knows it. */
  computerName: string | null;
}

/**
 * A high-contrast strip above every space while the phone has lost the computer, and briefly once it is back.
 * It takes its own row, so it pushes the keys down instead of covering them.
 */
export function ConnectionBanner({ banner, computerName }: ConnectionBannerProps) {
  const t = useT();
  if (banner === "none") return null;
  const lost = banner === "lost";
  const Icon = lost ? WifiOff : Wifi;
  return (
    <div
      className={lost ? "connection-banner connection-banner-lost" : "connection-banner connection-banner-restored"}
      data-testid="connection-banner"
      // The loss interrupts; the return is only good news.
      role={lost ? "alert" : "status"}
    >
      <Icon size={20} aria-hidden="true" focusable="false" />
      <span>{lost ? t("connection.lost", { name: computerName ?? t("connection.yourComputer") }) : t("connection.restored")}</span>
    </div>
  );
}
