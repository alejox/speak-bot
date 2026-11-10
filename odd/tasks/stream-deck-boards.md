# Feature: stream-deck-boards

## Objective
Turn Speak Bot into a general-purpose stream deck. Boards of keys, where each key has an icon, a color, a label and an action, with assistive communication (voice and captions) built in as first-class action categories.

## Problem / Why
User decision (2026-11-09): "it is going to be a stream deck, with these aids", modeled on stream-deck-style apps the user showed (boards list, key grid with pages, action library). One tool for streamers who cannot speak, instead of two.

## Scope (first version)
Action categories:
- **Voice**: speak text, stop, repeat last, switch voice language.
- **Captions**: clear caption, hide/show captions.
- **Navigation**: next page, previous page, go to page, go to board. These run in each client, since every client keeps its own current board and page.
- **OBS** (obs-websocket v5): switch scene, toggle input mute, toggle stream, toggle recording, toggle source visibility. Keys reflect live state (muted, live, recording, current scene).

## Out of scope (later)
System actions (open URL or app, play sound), keyboard shortcuts (native per OS), plugins, multi-actions, live transcription for deaf users (raised as a possible future need).

## Design decisions
- **Core model**:
  - `Board { id, name, columns: 5, rows: 3, keys: Key[] }`.
  - `Key { slot, label?, icon?, color?, action }`.
  - `Action` is a discriminated union.
  - An action registry (category, type, param schema, i18n keys) drives both the library panel and the key editor.
- **Persistence**: `BoardRepository` port. Desktop uses one atomic JSON file with check-and-write inside one queue operation, which also fixes the deferred slot race. Local phone mode uses localStorage.
- **Migration**: existing phrases become the board "Comunicación". Phrases keep their slots; the communication actions go to the last row if it is free, otherwise to the next page. New installs get a pre-built "Comunicación" board in the UI language.
- **Execution**: clients send key presses or actions to the desktop, `POST /api/actions/execute`. The server runs voice, captions and OBS actions. Navigation is handled in the client. In local (phone-only) mode, voice runs on the device and captions and OBS keys are disabled.
- **OBS**: `obs-websocket-js` in the desktop server. Host, port and password live in desktop settings; the password is never returned by the API (`hasPassword` only). Auto-reconnect with backoff. Scenes and inputs are listed for the editor dropdowns. OBS state changes are pushed to clients over WebSocket.
- **UI**:
  - Desktop window: three panes. Boards list, key grid with pages, and an action library with search. Below them, a key editor (icon, color, label, action parameters).
  - Assigning an action: drag and drop, with click-to-assign as the accessible alternative.
  - Phone and OBS dock: board selector plus grid playback; editing on the phone through a modal.
  - Side navigation: Tablero, Hablar (typing stays), Conectar, Ajustes (including the OBS connection).
- **Look**: original styling and icons (an open-source icon set or our own glyphs). No Elgato or Deckboard branding, and no copied visuals.

## Tasks
- [ ] T8 — Core boards/keys/actions model + registry + migration from phrases; desktop BoardRepository + `/api/boards` CRUD + `/api/actions/execute` (voice, captions); remove the phrases API; fold the deferred slot-race fix. Tests.
- [ ] T9 — OBS integration in the desktop: settings, connection manager, actions, scenes/inputs endpoints, state events, connection status. Tests with a fake OBS client.
- [ ] T9b — Rename the app to **Speed Deck** (`speed-deck`), chosen by the user on 2026-11-09 (first "speak-deck", then corrected by the user to "Speed Deck"), with a new original icon (app, tray, PWA, favicon). Icon direction (user, 2026-11-09): a button-board or keypad look (a grid of rounded keys, deck style), with at most a subtle speech hint on one key. Original artwork; Deckboard's or Elgato's logos are not copied. **Chosen: option C** (2×3 deck inside a dark rounded square, a blue key with voice waves and a green key). Source: scratchpad `icons/c.svg`, to be committed as `apps/electron/build/icon.svg`. macOS tray: a monochrome template version. Changes:
  - Rename `productName`, `appId` (`io.github.alejox.speeddeck`), workspace package scope `@speed-deck/*`, window and manifest titles, i18n strings, overlay title and artifact names.
  - Data dir becomes `speed-deck`, with a one-time migration from `speak-bot`.
  - `SPEED_DECK_*` env vars, with the `SPEAK_BOT_*` names still accepted as fallbacks.
  - The GitHub repo name and Pages base (`/speak-bot/`) are unchanged until the user decides on a repo rename.
- [ ] T10 — UI: board editor (3 panes, drag and drop plus click-to-assign, key editor with icon, color, label and parameters), boards CRUD, playback in phone, dock and local mode, navigation actions, OBS state on keys, OBS settings form, i18n es/en. Fold the `suppressClick` nit. Tests and screenshots.
- [ ] T11 — README: boards, actions, OBS connection setup (Tools → WebSocket Server Settings).

## Constraints
- macOS, Windows and Linux first class. English identifiers; UI copy through i18n (es default, en).
- Keep the iOS rule: local speech is invoked synchronously in the tap.
- Hexagonal: core stays framework-free; OBS is an adapter behind a port.

## Route declaration
- T8+T9: one delegated backend writer. T10: one delegated UI writer after T8/T9. T11: inline.

## Delivery
- Branch `feat/stream-deck-boards`, stacked on `feat/ui-nav-i18n-dock` (`84bb963`). Large; chain slicing to be decided before PRs.
- RDD: off (global).

## Progress / Evidence
- T8 `9d454a4`, T9 `3636b84` (backend writer). RED→GREEN observed, except for `domain/actions.ts` and the obs protocol guards, which were written before their tests. Tests 93/137/12/123. Smoke: legacy phrases migrated to "Comunicación"; `captions.clear` returns 200; OBS actions without OBS return 409; the password is never exposed.
- Independent verifier: FAIL, 2 medium and 3 low findings. Fixed test-first:
  - `a3f06f7`: OBS settings and connect are loopback-only, and the password is cleared when the host or port changes (it could be sent to an attacker's OBS).
  - `d6f132a`: OBS connect/disconnect/close are serialized, and `close()` is terminal.
  - `3ddc137`: restore at the board limit returns 409 `board-limit`.
  - `9323ff5`: invalid legacy phrases are skipped and no longer block startup.
  - Finding 5 (the phrase bridge hides action keys) is left for T10, which removes the bridge.
- T9b `6a0ec22`: renamed to Speed Deck; icon C, colored and macOS template tray icons, maskable PWA icon; one-time copy of the `speak-bot` data dir; migration of `speak-bot:` storage keys and Linux autostart; `SPEED_DECK_*` env vars with `SPEAK_BOT_*` fallback. Tests 94/152/13/126; packaged "Speed Deck.app" smoke OK; a LAN client changing OBS settings gets 403.
- Open: the packaged Electron app did not exit on SIGTERM (needed kill -9); check the quit path in T10. Remaining verifier nits: stale OBS state after a disconnect, no rename events for scenes or inputs, non-atomic settings toggles, corrupt `boards.json` overwrites its `.bak`, dangling `nav.goToBoard` keys.

## Next step
T8+T9 backend writer.
