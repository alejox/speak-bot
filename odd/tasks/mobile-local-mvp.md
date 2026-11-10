# Feature: mobile-local-mvp

## Objective
A mobile-first PWA that lets a person who cannot speak type text or tap saved phrases and have the device read them aloud, fully offline, with no desktop required.

## Problem / Why
Speech-impaired users need a voice both in person and while streaming. The in-person case must work standalone on a phone. This MVP delivers that case first; desktop/OBS/remote control come in a later feature.

## Scope
- npm workspaces monorepo (TypeScript).
- `packages/core`: framework-free domain (Phrase), ports (PhraseRepository, SpeechSynthesizer), use cases (speak text, save/list/delete phrases).
- `apps/mobile`: Vite + React PWA with adapters (localStorage repository, Web Speech API synthesizer) and UI (text input + speak, phrase grid, add/delete phrase, voice selection).
- README with run instructions.

## Out of scope
Desktop app, OBS captions, WebSocket remote mode, virtual mic, cloud TTS.

## Constraints
- Hexagonal: core has zero dependency on React, browser APIs, or storage.
- English for code, UI copy, and docs.
- Offline-capable (PWA service worker, system voices).
- No pnpm installed: use npm workspaces.

## Tasks
- [x] T1 — Monorepo scaffold + `packages/core` domain, ports, use cases with Vitest tests (test-first). Commit `22492b6`.
- [x] T2 — `apps/mobile` PWA: adapters, UI, manifest/service worker, adapter tests. Commit `83c8fd4`.
- [x] T3 — README (purpose, architecture, how to run on phone over LAN).

## Acceptance criteria
- `npm test` passes for core and mobile.
- `npm run build` produces the mobile PWA without type errors.
- Typing text and pressing Speak reads it aloud; saved phrases persist across reloads and speak on tap.

## Checks
- `npm test`, `npm run typecheck`, `npm run build` from repo root.

## Route declaration
- T1, T2: delegated direct (writer trigger: 2+ non-trivial files).
- T3: inline (single passive doc).

## Delivery
- Strategy: ask-on-risk (default). Forecast ~900 authored lines (exceeds ~400 budget) — chain strategy to be asked before any PR. No remote configured; push/PR are user decisions.
- RDD: off (decided by global) — ordinary checks only.

## Progress / Evidence
- Branch `feat/mobile-local-mvp` from `a2ac715` (empty initial commit on `main`).
- T1 RED: `npm test` → "Test Files 2 failed … Failed to load url ../src". GREEN: 19/19 passing.
- Writer verification: `npm install` ok (audit: 6 low/moderate build-time issues via vite-plugin-pwa/workbox); `npm test` core 19/19, mobile 24/24; `npm run typecheck` ok; `npm run build` ok (sw.js + manifest, 8 precached files).
- Parent spot check: `npm test` → core 19 passed, mobile 24 passed.
- Review assess (base `a2ac715`, committed-only): risk `high`, review_due `high_risk`. RDD off → independent read-only verifier: PASS, 1 low defect (`crypto.randomUUID` missing over LAN http broke seeding/saving). Fixed test-first with `createId` fallback (RED: module missing; GREEN: tests 19 + 26, typecheck ok, build ok). Nits deferred: duplicate-save race on double tap, focus after delete, Edit button aria-pressed + text change, voices timer cleanup.
- ~1,270 authored changed lines across T1+T2 (lockfile excluded).
- Engram mirror: PENDING (auto-mode classifier could not review mem_save).

## Open issues
- Not tested on a real device/browser (jsdom only).
- iOS may prefer PNG apple-touch-icon (only SVG provided).

## Next step
Process the verifier result; then the user decides chain strategy before any PR, and the next feature (desktop + OBS + remote mode).
