# Feature: desktop-app

## Objective
End users never touch a terminal. The phone app is a hosted, installable PWA. The computer app is a double-click installer for macOS, Windows and Linux that runs the existing server invisibly.

## Problem / Why
`npm start` and a visible server are not usable by the people this tool is for (user feedback, 2026-11-09).

## Design decisions
- **Electron** (`apps/electron`) runs the existing `apps/desktop` server in the main process; no rewrite. Chosen over Tauri plus a Node sidecar: no Rust needed and the server code is reused as-is. Tradeoff: an installer of about 100 MB.
- The window loads the same UI from the local server (Computer mode by default).
- A **Connect panel** in the UI, shown when the UI runs on the desktop host: QR code and LAN URL for the phone, plus a "Copy OBS URL" button. Data comes from a new `GET /api/connection`.
- **Tray icon.** Closing the window keeps the server running for OBS. Single-instance lock. Optional start at login.
- **Port fallback.** If 4545 is busy, try the next ports and report the actual one.
- **Installers** are built by GitHub Actions on `v*` tags: dmg (macOS arm64 + x64), NSIS exe (Windows), AppImage and deb (Linux), attached to a GitHub Release. **Unsigned**; the README explains the Gatekeeper and SmartScreen warnings.
- **GitHub Pages** hosts the mobile PWA at `https://alejox.github.io/speak-bot/`. The Vite `base` is configurable (`/` when served by the desktop, `/speak-bot/` for Pages). It deploys from `main`, so it only goes live after merging.

## Constraints
- macOS, Windows and Linux are first class.
- English for artifacts; Conventional Commits; no AI attribution.
- Test-first for pure logic (port fallback, connection info, LAN address selection); the GUI is verified manually and through packaging smoke tests.

## Tasks
- [ ] T1 — `apps/electron`: main process (server, window, tray, single instance, start at login, port fallback), bundling, `/api/connection` and Connect panel (QR, OBS URL), tests.
- [ ] T2 — electron-builder config + release workflow (tags `v*`, 3 OS) + local `--dir` packaging smoke test on macOS.
- [ ] T3 — Configurable Vite base + GitHub Pages workflow for the mobile PWA.
- [ ] T4 — README: end-user install (phone and computer), unsigned-app warnings, release process.
- [ ] T5 — Enable Pages (Actions source) on the repo; first release after the user decides on merge and tag.

## Route declaration
- T1–T3: delegated direct (writer trigger).
- T4, T5: inline.

## Delivery
- Branch `feat/desktop-app`, stacked on `feat/desktop-obs` (`c046f89`+doc).
- RDD: off (global).

## Progress / Evidence
- Writer: T1 `e7a86b2`, T2 `c6988a0`, T3 `1d5fdcf`; RED→GREEN observed. Packaged `--dir` app launched on macOS: port fallback, health, connection, overlay and single-instance lock OK.
- T4 inline `32244a7` (README install guide, unsigned warnings, release process).
- Assess: risk high → independent verifier PASS with 1 medium (macOS 0.0.0.0 bind hides a 127.0.0.1 port conflict, so the window loaded another app) and 2 low findings. Scoped correction, test-first: `c890ff9` port ownership via instanceId and window on 127.0.0.1; `0f3260a` `/api/connection` loopback-only; `8b79cde` macOS template tray icon. Packaged smoke with a conflicting 127.0.0.1 server fell back to the next port, verified by its instanceId.
- Parent spot check: `npm test` → 22, 87, 8, 61 passed.
- Not verified for real: window and tray UI visually, macOS hidden start at login, dmg/NSIS/AppImage/deb builds, release and pages workflows on GitHub.
- Delivery: stacked PRs chosen by the user, one per feature branch, each a size exception: #1 `feat/mobile-local-mvp` → main (~1,830 lines, no CI because the workflow arrives in #2), #2 `feat/desktop-obs` → #1 (~3,950), #3 `feat/desktop-app` → #2 (~2,030). Local unsigned dmg built: `apps/electron/release/speak-bot-0.0.0-mac-arm64.dmg` (120 MB).
- Deferred nits: no `will-redirect` guard; `--hidden` second instance still shows the window; non-semver tags break the release.

## Next step
T1–T3 writer.
