// Generates THIRD-PARTY-NOTICES.txt: the name, version, licence and full licence text of every third-party
// package whose code ships in Speed Deck (the web UI, also inside the Android app, and the computer app's
// main bundle). The build fails when a shipped package has no licence text, instead of leaving it out.
//
//   node scripts/third-party-notices.mjs [--out <file>]...
//
// Without --out it writes apps/mobile/dist/THIRD-PARTY-NOTICES.txt, which is served next to the web UI and
// copied into the computer app's resources by electron-builder.
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** A shipped package has no licence text, no licence id, or cannot be found. */
export class MissingLicenceError extends Error {
  constructor(problems) {
    super(`Third-party notices cannot be generated:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "MissingLicenceError";
    this.problems = problems;
  }
}

/** File names that hold a licence or the notices that must travel with it. */
const LICENCE_FILE = /^(licen[cs]e|copying|unlicense)([-._].*)?$/i;
const NOTICE_FILE = /^notice([-._].*)?$/i;
const RULE = "=".repeat(80);
const THIN_RULE = "-".repeat(80);

async function readManifest(dir) {
  return JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
}

/** The folder of package `name` as Node would find it from `fromDir`, or null when it is not installed. */
function findPackageDir(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(dir) === dir) return null;
  }
}

/**
 * The package folders that `files` (paths of bundled modules) belong to, in order of first appearance.
 * Files outside node_modules are the app's own code and are left out.
 */
export function packagesOfFiles(files) {
  const marker = `${sep}node_modules${sep}`;
  const dirs = [];
  for (const file of files) {
    const at = file.lastIndexOf(marker);
    if (at === -1) continue;
    const [first = "", second = ""] = file.slice(at + marker.length).split(sep);
    const dir = join(file.slice(0, at + marker.length), first.startsWith("@") ? join(first, second) : first);
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

function licenceIdOf(manifest) {
  const { license, licenses } = manifest;
  if (typeof license === "string" && license.trim() !== "") return license.trim();
  if (license && typeof license === "object" && typeof license.type === "string") return license.type;
  if (Array.isArray(licenses)) {
    const types = licenses.map((entry) => (typeof entry === "string" ? entry : entry?.type)).filter((type) => typeof type === "string" && type !== "");
    if (types.length > 0) return types.join(" OR ");
  }
  return null;
}

/** The licence files of a package (then its notice files), each with its text. */
async function licenceTextsOf(dir) {
  const entries = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const names = [...entries.filter((name) => LICENCE_FILE.test(name)), ...entries.filter((name) => NOTICE_FILE.test(name))];
  const texts = [];
  for (const name of names) {
    const text = (await readFile(join(dir, name), "utf8")).replace(/\r\n/g, "\n").trim();
    if (text !== "") texts.push({ file: name, text });
  }
  return texts.some(({ file }) => LICENCE_FILE.test(file)) ? texts : [];
}

function repositoryOf(manifest) {
  const { repository, homepage } = manifest;
  const url = typeof repository === "string" ? repository : repository?.url;
  return (typeof url === "string" && url !== "" ? url : typeof homepage === "string" ? homepage : "").replace(/^git\+/, "").replace(/\.git$/, "");
}

/** The reviewed licence text kept in `textsDir` for a package that ships none, or null. */
async function reviewedTextOf(textsDir, name, version) {
  if (!textsDir) return null;
  const file = join(textsDir, `${name.replace("/", "__")}@${version}.txt`);
  if (!existsSync(file)) return null;
  return { file, text: (await readFile(file, "utf8")).replace(/\r\n/g, "\n").trim() };
}

/**
 * Collects the third-party packages to give notice of and renders the notices text.
 * - `roots`: package folders whose production dependencies (and theirs, and so on) ship. Optional
 *   dependencies are not followed: they are builds for one system (a native binary), so following them would
 *   make the notices differ from one build machine to the next, and none of them is bundled.
 * - `bundled`: folders of further packages whose code a bundler put in the output, found by looking at
 *   the bundle itself. They are listed as they are; what they depend on is in the bundle (and so in this
 *   list) only if it was bundled too.
 * - `isFirstParty`: packages of the product itself; their dependencies count, they are not listed.
 * - `textsDir`: reviewed licence texts (`<name>@<version>.txt`, "/" as "__") for packages that ship without
 *   a licence file. Only these exact versions are covered; any other package without one fails.
 * - `mustContain`: texts that have to be in a package's licence (e.g. the font's own licence), as a check.
 * Rejects with MissingLicenceError listing every package that is not installed or has no licence id or text.
 */
export async function buildNotices({ roots, bundled = [], isFirstParty = () => false, textsDir, mustContain = [] }) {
  const problems = [];
  const seen = new Set();
  const packages = new Map();
  const queue = [...roots.map((dir) => ({ dir: realpathSync(dir), listed: false, followed: true })), ...bundled.map((dir) => ({ dir: realpathSync(dir), listed: true, followed: false }))];

  while (queue.length > 0) {
    const { dir, listed, followed } = queue.shift();
    const visit = `${dir}|${followed}`;
    if (seen.has(visit)) continue;
    seen.add(visit);
    const manifest = await readManifest(dir);
    const id = `${manifest.name}@${manifest.version}`;
    if (listed && !isFirstParty(manifest.name) && !packages.has(id)) {
      const licence = licenceIdOf(manifest);
      const own = await licenceTextsOf(dir);
      const reviewed = own.length === 0 ? await reviewedTextOf(textsDir, manifest.name, manifest.version) : null;
      const texts = reviewed ? [reviewed] : own;
      if (!licence) problems.push(`${id} does not say which licence it is under (no "license" in ${join(dir, "package.json")}).`);
      if (texts.length === 0) problems.push(`${id} has no licence text (no LICENSE, LICENCE or COPYING file in ${dir}, and no reviewed text for this version).`);
      packages.set(id, { name: manifest.name, version: manifest.version, licence: licence ?? "", repository: repositoryOf(manifest), texts, dir });
    }
    if (!followed) continue;
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      const found = findPackageDir(name, dir);
      if (found) queue.push({ dir: found, listed: true, followed: true });
      else problems.push(`${name}, a dependency of ${id}, is not installed (run npm ci).`);
    }
    // A peer is provided by whoever uses the package; when it is installed it ships like any dependency.
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      // An optional peer is an extra (often only types): not something this package needs to run.
      if (manifest.peerDependenciesMeta?.[name]?.optional) continue;
      const found = findPackageDir(name, dir);
      if (found) queue.push({ dir: found, listed: true, followed: true });
    }
  }

  const sorted = [...packages.values()].sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version, "en", { numeric: true }) : a.name < b.name ? -1 : 1));
  for (const { name, text } of mustContain) {
    const matches = sorted.filter((candidate) => candidate.name === name);
    if (matches.length === 0) problems.push(`${name} was expected among the shipped packages and is not there.`);
    else if (!matches.every((candidate) => candidate.texts.some((entry) => entry.text.includes(text)))) problems.push(`The licence text of ${name} does not contain "${text}".`);
  }
  if (problems.length > 0) throw new MissingLicenceError(problems);
  return { packages: sorted, text: renderNotices(sorted) };
}

export function renderNotices(packages) {
  const header = [
    "THIRD-PARTY NOTICES",
    "",
    `Speed Deck includes the open-source software listed below (${packages.length} packages). Each entry names the`,
    "package, its version and its licence, followed by the licence text it is distributed under.",
    "",
  ];
  const entries = packages.map(({ name, version, licence, repository, texts }) =>
    [RULE, `${name} ${version}`, `Licence: ${licence}`, ...(repository ? [`Source: ${repository}`] : []), THIN_RULE, "", texts.map(({ text }) => text).join(`\n\n${THIN_RULE}\n\n`), ""].join("\n"),
  );
  return `${header.join("\n")}\n${entries.join("\n")}`;
}

// ---- This repository ----

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIST = join(REPO, "apps", "mobile", "dist");
export const NOTICES_FILE_NAME = "THIRD-PARTY-NOTICES.txt";

/**
 * Build tools whose own code ends up in what ships (module loading helpers, the service worker registration):
 * each one as the package path Node follows from a workspace, e.g. the bundler Vite itself depends on.
 */
const BUILD_TOOLS_IN_OUTPUT = [
  { workspace: "mobile", path: ["vite"] },
  { workspace: "mobile", path: ["vite", "rolldown"] },
  { workspace: "mobile", path: ["vite-plugin-pwa"] },
  { workspace: "electron", path: ["esbuild"] },
];

/** The packages esbuild puts in the computer app's main bundle, from a dry run of that same build. */
async function electronMainPackages() {
  const electronDir = join(REPO, "apps", "electron");
  const { build } = createRequire(join(electronDir, "package.json"))("esbuild");
  const { bundleOptions } = await import(pathToFileURL(join(electronDir, "scripts", "bundle-options.mjs")).href);
  const result = await build({ ...bundleOptions, write: false, metafile: true, sourcemap: false, logLevel: "silent" });
  return packagesOfFiles(Object.keys(result.metafile.inputs).map((input) => resolve(electronDir, input)));
}

/**
 * The Workbox packages inside the generated service worker. Each Workbox module marks itself in the output
 * as `workbox:<module>:<version>`; they come from the PWA plugin, not from any production dependency.
 */
async function serviceWorkerPackages() {
  if (!existsSync(join(WEB_DIST, "index.html"))) throw new Error(`The web UI is not built (${WEB_DIST}). Run "npm run build -w @speed-deck/mobile" first.`);
  const names = new Set();
  for (const file of (await readdir(WEB_DIST)).filter((name) => name.endsWith(".js"))) {
    const source = await readFile(join(WEB_DIST, file), "utf8");
    for (const [, module] of source.matchAll(/workbox:([a-z-]+):\d+\.\d+\.\d+/g)) names.add(`workbox-${module}`);
  }
  const pluginDir = findPackageDir("vite-plugin-pwa", join(REPO, "apps", "mobile"));
  return [...names].map((name) => {
    const dir = (pluginDir && findPackageDir(name, pluginDir)) ?? findPackageDir(name, join(REPO, "apps", "mobile"));
    if (!dir) throw new MissingLicenceError([`${name} is in the generated service worker and is not installed.`]);
    return dir;
  });
}

function buildToolPackages() {
  return BUILD_TOOLS_IN_OUTPUT.map(({ workspace, path }) => {
    let dir = join(REPO, "apps", workspace);
    for (const name of path) {
      const found = findPackageDir(name, dir);
      if (!found) throw new MissingLicenceError([`${path.join(" > ")} leaves code in the build and is not installed (run npm ci).`]);
      dir = found;
    }
    return dir;
  });
}

export async function buildSpeedDeckNotices() {
  return buildNotices({
    roots: [join(REPO, "apps", "mobile"), join(REPO, "apps", "desktop"), join(REPO, "packages", "core")],
    bundled: [...(await electronMainPackages()), ...(await serviceWorkerPackages()), ...buildToolPackages()],
    isFirstParty: (name) => name.startsWith("@speed-deck/"),
    textsDir: join(REPO, "scripts", "third-party-licence-texts"),
    // The font ships inside the web UI under the SIL Open Font License, which asks to be included.
    mustContain: [{ name: "@fontsource-variable/inter", text: "SIL OPEN FONT LICENSE" }],
  });
}

async function main(argv) {
  const outputs = argv.flatMap((arg, index) => (arg === "--out" && argv[index + 1] ? [resolve(argv[index + 1])] : []));
  if (outputs.length === 0) outputs.push(join(WEB_DIST, NOTICES_FILE_NAME));
  const { text, packages } = await buildSpeedDeckNotices();
  for (const output of outputs) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, text, "utf8");
    console.log(`Third-party notices: ${packages.length} packages -> ${output}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
