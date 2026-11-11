import { isLocalHostname } from "./composition-root";

/**
 * Whether this page may create and edit Deck keys (the OBS board): only on the computer itself, the page the
 * desktop app serves on localhost. Any other page (a phone on the network, the Android app) plays the Deck as
 * it was configured there. Voice stays editable everywhere. A host that is not known (no `servedFrom`, as
 * in tests that do not ask for one) keeps editing, as before this rule.
 */
export function canEditDeck(hostname: string | undefined): boolean {
  return hostname === undefined || isLocalHostname(hostname);
}
