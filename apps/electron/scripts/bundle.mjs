// Bundles the Electron main process (with @speak-bot/core and @speak-bot/desktop inlined)
// into a single CommonJS file, so the installer needs no node_modules.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: "linked",
  logLevel: "info",
  // Provided by Electron at runtime; ws loads these optional native addons only if present.
  external: ["electron", "bufferutil", "utf-8-validate"],
  // The desktop package computes default file locations from import.meta.url. In the CommonJS
  // bundle point it at the bundle itself; the app always passes explicit paths anyway.
  define: { "import.meta.url": "__bundleFileUrl" },
  banner: { js: 'const __bundleFileUrl = require("node:url").pathToFileURL(__filename).href;' },
});
