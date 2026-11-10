# Feature: desktop-obs

## Objective
A desktop companion that speaks through the computer's audio (selectable output device, e.g. a virtual mic), shows captions in OBS via a Browser Source, and lets the phone act as a remote deck.

## Problem / Why
For streams and calls, speech must come out of the computer (OBS, Discord, Zoom), with on-screen captions, while phrases can be triggered from the phone.

## Design decisions
- **Node.js local server (`apps/desktop`), not Tauri for now.** Rust is not installed, and Tauri's backend is Rust, which would not reuse the TypeScript core. Native packaging (Electron or Tauri with a Node sidecar) is deferred.
- **System TTS on the server.** macOS `say` supports `-a <device>` for output-device selection (verified locally: `say -a '?'` lists devices), so BlackHole or another virtual device can feed calls. Windows (PowerShell System.Speech) and Linux (espeak-ng) adapters are best effort.
- **The desktop server hosts the mobile PWA build.** The phone opens `http://<desktop-ip>:<port>/`, which is same-origin, so WebSocket and fetch work without mixed-content issues. The desktop browser uses the same UI as a control panel.
- **OBS overlay** at `/overlay`: a transparent caption page that receives events over WebSocket.
- **The mobile app gains a "Speak on: this device / computer" mode** through remote adapters for the existing core ports, which validates the hexagonal design.

## Scope
- Shared WebSocket/HTTP protocol types in `packages/core`.
- `apps/desktop`: HTTP + WebSocket server, JSON-file phrase repository, system TTS adapters, voices and audio-device listing, speak/stop, caption broadcast, static hosting of the mobile build and the overlay.
- Overlay page with query-param styling (font size, position, hold duration).
- Mobile remote mode (auto-available when served by the desktop).
- README: OBS setup and virtual mic routing.

## Out of scope
Native installer/packaging, cloud TTS, authentication (LAN only; documented risk), Stream Deck plugin.

## Constraints
- Hexagonal: the server and the mobile app depend on core ports; adapters live in the apps.
- English for code, UI copy, and docs. Conventional commits with no AI attribution.
- Test-first for behavior with runnable tests (Vitest).
- **macOS, Windows and Linux are first-class targets** (user requirement, 2026-11-09). TTS and output-device selection on every OS: macOS `say -a`; Linux `espeak-ng` | `paplay --device` (`pactl` sinks); Windows System.Speech plus WinRT MediaPlayer `AudioDevice` (fallback: default device with `supportsDeviceSelection: false`). OS-specific data dirs. No POSIX-only scripts. CI matrix on ubuntu/macos/windows.
- Only macOS can be run locally; Windows and Linux are verified through unit tests and CI.

## Tasks
- [x] T1 — Core protocol types + `apps/desktop` server (phrases API, speak/stop, voices/devices, WS broadcast, JSON repo, TTS adapters) with tests.
- [x] T2 — OBS overlay page served at `/overlay`, plus static hosting of the mobile build.
- [x] T3 — Mobile remote mode (remote adapters, mode toggle, auto-detect) with tests.
- [x] T4 — README: desktop usage, OBS Browser Source, virtual mic (BlackHole / VB-Cable), LAN security note.
- [ ] T5 — Manual verification: real speech + OBS on macOS (user); Windows and Linux on real machines or CI.
  - 2026-11-09: macOS verified by the user: captions appear in OBS, and the voice plays and is captured by OBS. Windows and Linux pending (real machines or CI).

## Acceptance criteria
- `npm test`, `npm run typecheck`, `npm run build` pass from the root.
- `npm start -w apps/desktop` serves the UI; Speak in remote mode plays through the selected output device and the overlay shows the caption.

## Route declaration
- T1–T3: delegated direct (writer trigger: 2+ non-trivial files).
- T4: inline (passive doc).

## Delivery
- Branch `feat/desktop-obs`, stacked on `feat/mobile-local-mvp` (`6494a3f`).
- Strategy ask-on-risk; forecast ~1,500 lines; chain strategy asked before any PR.
- RDD: off (global).

## Progress / Evidence
- Environment: no Rust toolchain; macOS `say` voices and `-a` devices available.
- Writer commits: T1 `8deaead`, T2 `fdb32f9`, T3 `16e33c2`, CI `6c3ca38`. T4 inline `72053be` (README, `.gitattributes`, engines >=22).
- RED→GREEN observed per task (exception: process-speech-synthesizer/runner written before tests).
- Writer verification: tests core 22/22, desktop 55/55, mobile 42/42; typecheck ok; build ok; smoke run on macOS ok (health, phrases, 186 voices, 2 devices, overlay 200, traversal 404).
- Parent spot check: `npm test` → 22, 55, 42 passed.
- Assess (base `6494a3f`): risk high → independent verifier: FAIL with 3 medium defects: (1) malformed WS upgrade URL crashes the server (reproduced); (2) TTS pipeline hangs when a later stage fails, and signal exits mask failures (reproduced); (3) no Origin/Host checks, so any website can read captions over WS and DNS rebinding can drive the API. One scoped correction applied test-first (RED→GREEN per defect): `48b966e` upgrade guard, `e37b0b2` pipeline kill-all and signal codes, `7c6b062` Host/Origin allowlist plus `--allowed-host`, `bc7afb6` overlay `CSS.supports` color validation. Tests 22/63/42, typecheck ok, build ok, smoke run: foreign Host → 403. Parent spot check: `npm test` → 22, 63, 42 passed.
- Deferred nits: remote `speaking end` race can clear speaking state early.
- Ran on macOS only; Linux and Windows paths are unit-tested only (CI not run, no remote).

- 2026-11-09: published as a public repo, https://github.com/alejox/speak-bot. Pushed `main`, `feat/mobile-local-mvp` and `feat/desktop-obs`. CI triggers only on push to `main` or on pull requests, so it has not run yet.

## Next step
Process verifier result; real-device test on Windows and Linux.
