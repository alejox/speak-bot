import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildNotices, MissingLicenceError, packagesOfFiles } from "../../../scripts/third-party-notices.mjs";

/** Writes a package with its manifest and files under `dir`. */
async function pkg(dir, manifest, files = {}) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
}

describe("third-party notices", () => {
  let root;
  const modules = (...parts) => join(root, "node_modules", ...parts);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "speed-deck-notices-"));
    // The app: one production dependency, one first-party package and one tool only used to build.
    await pkg(join(root, "app"), { name: "@fixture/app", version: "0.0.0", dependencies: { alpha: "^1.0.0", "@fixture/shared": "0.0.0" }, devDependencies: { "build-tool": "^9.0.0" } });
    await pkg(modules("@fixture", "shared"), { name: "@fixture/shared", version: "0.0.0", dependencies: { "@scope/gamma": "^3.0.0" } });
    await pkg(modules("alpha"), { name: "alpha", version: "1.2.3", license: "MIT", dependencies: { beta: "^2.0.0" } }, { LICENSE: "MIT License\nCopyright (c) Alpha Authors\n" });
    // A different version of beta nested under alpha, and another one at the top that nothing in the closure uses.
    await pkg(modules("alpha", "node_modules", "beta"), { name: "beta", version: "2.5.0", license: "ISC" }, { "LICENCE.md": "ISC License\nCopyright (c) Beta Authors\n" });
    await pkg(modules("beta"), { name: "beta", version: "1.0.0", license: "ISC" }, { LICENSE: "ISC License\nCopyright (c) Old Beta\n" });
    await pkg(modules("@scope", "gamma"), { name: "@scope/gamma", version: "3.1.0", license: "Apache-2.0" }, { "LICENSE.txt": "Apache License 2.0\n", NOTICE: "Gamma includes work by Someone.\n" });
    await pkg(modules("build-tool"), { name: "build-tool", version: "9.9.9" });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const firstParty = (name) => name.startsWith("@fixture/");

  it("lists every package of the production closure with its name, version, licence id and full licence text", async () => {
    const { text, packages } = await buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty });

    expect(packages.map(({ name, version, licence }) => `${name}@${version} ${licence}`)).toEqual(["@scope/gamma@3.1.0 Apache-2.0", "alpha@1.2.3 MIT", "beta@2.5.0 ISC"]);
    expect(text).toContain("3 packages");
    expect(text).toContain("alpha 1.2.3\nLicence: MIT");
    expect(text).toContain("MIT License\nCopyright (c) Alpha Authors");
    expect(text).toContain("beta 2.5.0\nLicence: ISC");
    expect(text).toContain("Copyright (c) Beta Authors");
    expect(text).toContain("@scope/gamma 3.1.0\nLicence: Apache-2.0");
    // A NOTICE file travels with the licence it belongs to.
    expect(text).toContain("Gamma includes work by Someone.");
  });

  it("leaves out first-party packages, build tools and versions nothing in the closure uses", async () => {
    const { text } = await buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty });
    expect(text).not.toContain("@fixture/");
    expect(text).not.toContain("build-tool");
    expect(text).not.toContain("Old Beta");
  });

  it("fails, naming the package, when a bundled package has no licence text", async () => {
    await pkg(modules("alpha", "node_modules", "delta"), { name: "delta", version: "4.0.0", license: "MIT" });
    await pkg(modules("alpha"), { name: "alpha", version: "1.2.3", license: "MIT", dependencies: { beta: "^2.0.0", delta: "^4.0.0" } });

    const failure = await buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty }).catch((error) => error);
    expect(failure).toBeInstanceOf(MissingLicenceError);
    expect(failure.message).toContain("delta@4.0.0");
    expect(failure.message).toMatch(/no licence text/i);
  });

  it("fails when a production dependency is not installed, instead of leaving it out", async () => {
    await pkg(join(root, "app"), { name: "@fixture/app", version: "0.0.0", dependencies: { alpha: "^1.0.0", missing: "^1.0.0" } });
    await expect(buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty })).rejects.toThrow(/missing/);
  });

  it("does not follow optional dependencies, which are builds for one system, installed or not", async () => {
    await pkg(modules("alpha"), { name: "alpha", version: "1.2.3", license: "MIT", optionalDependencies: { "alpha-win32": "1.2.3", "alpha-darwin": "1.2.3" } }, {});
    await pkg(modules("alpha-darwin"), { name: "alpha-darwin", version: "1.2.3", license: "MIT" });
    const { packages } = await buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty });
    expect(packages.map(({ name }) => name)).toEqual(["@scope/gamma", "alpha"]);
  });

  it("follows a peer that is installed, unless the package marks it optional", async () => {
    await pkg(
      modules("alpha"),
      { name: "alpha", version: "1.2.3", license: "MIT", peerDependencies: { beta: "*", "types-only": "*", absent: "*" }, peerDependenciesMeta: { "types-only": { optional: true } } },
      {},
    );
    await pkg(modules("types-only"), { name: "types-only", version: "1.0.0", license: "MIT" });
    const { packages } = await buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty });
    // The peer is found the way Node finds it from the package: here, the copy nested under it.
    expect(packages.map(({ name, version }) => `${name}@${version}`)).toEqual(["@scope/gamma@3.1.0", "alpha@1.2.3", "beta@2.5.0"]);
  });

  it("adds the packages found in a bundle that are no production dependency of anything, as they are", async () => {
    // The tool depends on more packages, but only its own code was found in the bundle.
    await pkg(modules("build-tool"), { name: "build-tool", version: "9.9.9", license: "BSD-3-Clause", dependencies: { beta: "^1.0.0" } }, { COPYING: "BSD 3-Clause\n" });
    const bundled = packagesOfFiles([join(modules("build-tool"), "runtime", "helper.js"), join(root, "app", "src", "main.js"), join(modules("@scope", "gamma"), "index.js")]);
    expect(bundled).toEqual([modules("build-tool"), modules("@scope", "gamma")]);

    const { packages, text } = await buildNotices({ roots: [join(root, "app")], bundled, isFirstParty: firstParty });
    expect(packages.map(({ name, version }) => `${name}@${version}`)).toEqual(["@scope/gamma@3.1.0", "alpha@1.2.3", "beta@2.5.0", "build-tool@9.9.9"]);
    expect(text).toContain("build-tool 9.9.9\nLicence: BSD-3-Clause");
  });

  it("fails for a package found in a bundle that has no licence text", async () => {
    const bundled = [modules("build-tool")];
    const failure = await buildNotices({ roots: [join(root, "app")], bundled, isFirstParty: firstParty }).catch((error) => error);
    expect(failure).toBeInstanceOf(MissingLicenceError);
    expect(failure.message).toContain("build-tool@9.9.9");
  });

  it("accepts a reviewed licence text for exactly the version that ships without one", async () => {
    await pkg(modules("alpha", "node_modules", "delta"), { name: "delta", version: "4.0.0", license: "MIT" });
    await pkg(modules("alpha"), { name: "alpha", version: "1.2.3", license: "MIT", dependencies: { beta: "^2.0.0", delta: "^4.0.0" } });
    const textsDir = join(root, "reviewed");
    await mkdir(textsDir);
    await writeFile(join(textsDir, "delta@3.9.0.txt"), "MIT License\nCopyright (c) Delta, an older version\n");
    await expect(buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty, textsDir })).rejects.toThrow(/delta@4\.0\.0/);

    await writeFile(join(textsDir, "delta@4.0.0.txt"), "MIT License\nCopyright (c) Delta Authors\n");
    const { text } = await buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty, textsDir });
    expect(text).toContain("delta 4.0.0\nLicence: MIT");
    expect(text).toContain("Copyright (c) Delta Authors");
    expect(text).not.toContain("an older version");
  });

  it("fails when a package says nothing about which licence it is under", async () => {
    await pkg(modules("alpha"), { name: "alpha", version: "1.2.3", dependencies: { beta: "^2.0.0" } });
    await expect(buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty })).rejects.toThrow(/alpha@1\.2\.3/);
  });

  it("requires the text a caller says must be there", async () => {
    await expect(buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty, mustContain: [{ name: "alpha", text: "SIL OPEN FONT LICENSE" }] })).rejects.toThrow(/alpha.*SIL OPEN FONT LICENSE/s);
    await expect(buildNotices({ roots: [join(root, "app")], isFirstParty: firstParty, mustContain: [{ name: "alpha", text: "MIT License" }] })).resolves.toBeTruthy();
  });
});
