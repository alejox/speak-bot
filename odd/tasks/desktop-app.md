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

## Next step
T1–T3 writer.
