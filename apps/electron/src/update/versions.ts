/** Where releases are published; the same repository the build's update source points at (electron-builder.yml). */
export const RELEASES_URL = "https://github.com/alejox/speak-bot/releases";

interface ParsedVersion {
  core: [number, number, number];
  /** True for `1.2.3-anything`: a development or preview build. */
  prerelease: boolean;
}

const STABLE = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/;
const WITH_PRERELEASE = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})(-[0-9A-Za-z.-]+)?$/;

function parse(version: string, pattern: RegExp): ParsedVersion | null {
  const match = pattern.exec(version);
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] !== undefined };
}

function compareCore(a: ParsedVersion, b: ParsedVersion): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = a.core[index]! - b.core[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Whether `candidate` is a published stable version (`1.2.3`, optionally `v1.2.3`) higher than the running
 * one. Prereleases, build metadata and anything that is not a version are never offered, and neither is a
 * downgrade. A development build (`1.3.0-dev.4`) counts as lower than the stable `1.3.0`.
 */
export function isNewerStableVersion(current: string, candidate: string): boolean {
  const running = parse(current, WITH_PRERELEASE);
  const offered = parse(candidate, STABLE);
  if (!running || !offered) return false;
  const difference = compareCore(offered, running);
  return difference > 0 || (difference === 0 && running.prerelease);
}

/** The page of a version's release, whose tag is `v<version>` (see .github/workflows/release.yml). */
export function releasePageUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version.replace(/^v/, "")}`;
}
