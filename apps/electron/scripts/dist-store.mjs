// Builds the Microsoft Store package (MSIX): `npm run dist:store -w @speed-deck/electron`, on Windows.
// The package identity comes from Partner Center → Speed Deck → Product management → Product identity:
//   SPEED_DECK_STORE_IDENTITY_NAME          Package/Identity/Name           (e.g. 12345Alejoxcode.SpeedDeck)
//   SPEED_DECK_STORE_PUBLISHER              Package/Identity/Publisher      (e.g. CN=1A2B3C4D-...)
//   SPEED_DECK_STORE_PUBLISHER_DISPLAY_NAME Package/Properties/PublisherDisplayName (e.g. alejoxcode)
// Optional: SPEED_DECK_VERSION, the version to package (the Store needs it to grow with every submission).
import { spawnSync } from "node:child_process";

const identity = {
  identityName: "SPEED_DECK_STORE_IDENTITY_NAME",
  publisher: "SPEED_DECK_STORE_PUBLISHER",
  publisherDisplayName: "SPEED_DECK_STORE_PUBLISHER_DISPLAY_NAME",
};
const missing = Object.values(identity).filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Missing the Store identity from Partner Center: ${missing.join(", ")}. See README.md, "Publishing to the Microsoft Store".`);
  process.exit(1);
}
if (process.platform !== "win32") {
  console.error("The Microsoft Store package can only be built on Windows (it needs makeappx from the Windows SDK).");
  process.exit(1);
}

const args = ["electron-builder", "--win", "appx", "--publish", "never"];
for (const [field, name] of Object.entries(identity)) args.push(`-c.appx.${field}=${process.env[name].trim()}`);
const version = process.env.SPEED_DECK_VERSION?.trim();
if (version) args.push(`-c.extraMetadata.version=${version}`);

const result = spawnSync("npx", args, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
