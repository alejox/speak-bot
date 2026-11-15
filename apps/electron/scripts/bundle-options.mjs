// How the Electron main process is bundled. Shared by the build (bundle.mjs) and by the third-party notices
// (scripts/third-party-notices.mjs), which runs the same bundling without writing it to know which packages ship.
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

export const bundleOptions = {
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
};
