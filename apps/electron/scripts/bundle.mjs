// Bundles the Electron main process (with @speed-deck/core, @speed-deck/desktop and electron-updater
// inlined) into a single CommonJS file, so the installer needs no node_modules.
import { build } from "esbuild";
import { bundleOptions } from "./bundle-options.mjs";

await build(bundleOptions);
