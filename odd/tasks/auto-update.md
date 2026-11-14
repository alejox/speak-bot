# Automatic updates for the computer app

Status: IMPLEMENTED, unproven end to end (authorized by the owner 2026-11-13). Branch `feat/auto-update`, stacked on `feat/play-billing` (PR #7).

## Objective
People who installed Speed Deck on a computer get new versions without downloading an installer by hand, when the owner publishes a tagged release.

## Problem / why
The release workflow already builds installers on `v*` tags and publishes them to GitHub Releases, and the repository is public, but the app never looks for a new version (`publish: null`, no updater code). No release has been published yet.

## Decisions (owner, 2026-11-13)
- Updates follow published releases (tags), never plain pushes.
- Windows (NSIS) and Linux AppImage: download in the background and install on quit or on request.
- macOS: the app is not signed with an Apple Developer ID, so it cannot install updates by itself; it only announces the new version with a link to download it. Linux `.deb`: same.
- Settings shows the current version, the update state and a manual check.
- Android is out of scope (Google Play updates it).

## Tasks
- [x] U1 Updater in the Electron app, API in the desktop server, Settings section in the web UI, release workflow and docs. Route: delegated writer (multi-package). electron-updater 6.8.11 bundled into `dist/main.cjs`; GitHub `publish` entry embeds `app-update.yml`; modes auto (Windows NSIS, Linux AppImage), notify (macOS, .deb), disabled (unpackaged); checks at startup and every 6 h, setting to turn them off; `GET /api/app-update`, loopback-only check/install, `app-update` event; "About and updates" group in Settings and a tray item; release workflow attaches `latest*.yml` and blockmaps.
  Evidence: RED in core (4), desktop (12), electron (4 files), mobile (10) then GREEN. Parent re-run 2026-11-13: typecheck clean; core 232, desktop 312, electron 86, mobile 562 passing (mobile twice); workflow YAML parses. Writer packaged all three OSes locally and launched the packaged macOS app: mode notify, quiet "no published versions" error, no crash.
  Notes: the per-installation id electron-updater sends by default is replaced with a constant, so a check sends nothing identifying. The writer saw 6 unrelated mobile test failures in one of three full runs that passed on re-run; not reproduced by the parent, cause unknown.
  NOT verified (needs two published releases): any real download or install on Windows or AppImage, restart-to-update, the "available" path against real GitHub data, the system notification, and the release workflow on GitHub Actions.

## Checks
`npm run typecheck`, `npm test`, `npm run build`, packaging on this Mac. A real update can only be proven after two releases are published.
