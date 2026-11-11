# Global board grid size

## Objective
Replace the fixed 5×3 board grid with one global, user-chosen size (columns 3–8, rows 2–5) that every board shares, chosen from a modal opened by a grid icon next to the board pill in the Deck header.

## Problem / why
The user wants more keys per page ("agregar más cuadros a la cuadrícula"). User decisions (2026-11-11): the size is global, not per board; it is set from a grid icon beside the "Deck" pill that opens a modal.

## Design
- The size lives in every `Board`'s existing `columns`/`rows` fields; all boards always share it. Changing it rewrites all boards in one atomic `BoardRepository.update`. New boards (create, restore default) take the current size.
- `readStoredBoard` reads stored `columns`/`rows` when valid (3–8 / 2–5), else 5×3. Mixed stored sizes normalize to the first board's size.
- `MAX_KEY_SLOTS` becomes a fixed upper bound (8 × 5 × `MAX_BOARD_PAGES` = 4000) so slot validation never depends on the grid and no stored key is dropped.
- Page size = `columns × rows` of the board; navigation, the + slot, paging and the move-to bound use it.
- Reflow on change: each key keeps its page, row and column when they fit the new grid; keys that no longer fit take the first free slot in reading order from their own page onward (new pages if needed, ≤ `MAX_BOARD_PAGES`). Growing never moves a key. If there is no room the change is refused.
- Default communication keys and caption seed slots take the last slots of the page computed from the board's grid (with ≥ 5 columns this is today's last row).
- Remote: `PUT /api/boards/grid {columns, rows}` → reflow + `boards-changed` broadcast. Phone-only: the local board repository.
- CSS: `.deck-grid` gets `--grid-columns`/`--grid-rows`. Changed by user request 2026-11-11: in the main app (Voice and Deck, every width) the page keeps the board proportions — exactly columns × rows square keys sized to fit the area (size container, `min(width / columns, height / rows)`), labels and icons scale with the key (cqi); only the dock keeps its compact layout.

## Tasks
- [x] T1 — Core: grid-aware board model (`makeBoard`, `readStoredBoard`, slot bound), navigation, defaults, caption migration, `setBoardGrid` use case with reflow; tests. Route: delegated (writer trigger: several non-trivial files). Done in 5041fcb — RED: new `packages/core/test/board-grid.test.ts` 14/15 failing; GREEN: core 154/154, desktop 157/157 (its hard-coded slot-1500 bound now uses `MAX_KEY_SLOTS`), root typecheck clean.
- [x] T2 — Desktop: `PUT /api/boards/grid` and repository behavior; tests. Route: delegated (same writer). Done in T2 commit (see Progress) — RED: 3 API tests failing (grid route, 409 grid-full, JSON content type); GREEN: desktop 160/160, typecheck clean. Adds `ApiErrorCode` "grid-full".
- [x] T3 — Mobile: grid icon + modal next to the board pill, deck hook / local and remote stores, BoardPlayer + CSS driven by the board's grid, en/es strings; tests. Route: delegated (same writer). Done in the T3 commit (see Progress) — RED: new `apps/mobile/test/board-grid.test.tsx` 4/4 failing; GREEN: mobile 285/285 + 4 grid tests, typecheck clean. Fit-to-screen on phones is CSS only (jsdom cannot measure layout): covered by a structural assertion on `--grid-columns`/`--grid-rows` and a manual check.

- [x] T4 — App shell never scrolls the document: scroll containers become the containing block of hidden absolutely positioned elements, `overflow: clip` on html/body at every width; regression test. Reason: user request 2026-11-11. Route: delegated (same writer). Hypothesis confirmed in the CSS: the colour/icon radios are `.visually-hidden` (`position: absolute`) inside `.inspector`, which was not positioned, so their containing block was the viewport. Fix: `position: relative` on every scroll container (`.app-main`, `.inspector`, `.recent-list`), `overflow: clip` (fallback `hidden`) on html/body at every width, shell `100dvh` at every width (from T3). RED: new `apps/mobile/test/shell-overflow.test.ts` (CSS-structure assertion, jsdom cannot measure layout) 2/2 failing; GREEN: mobile 287/287. Manual check still pending: packaged app, inspector open, focus last field and a swatch, shell must not shift.
- [x] T5 — Two key colors: optional `activeColor` used when a stateful key is on; core validation and persistence, desktop API, editor with "Color when off" / "Color when on" for stateful actions only; tests. Reason: user request 2026-11-11. Route: delegated (same writer). Stateful = the actions `presentKey` gives an on state: captions.toggle, obs.toggleMute, obs.toggleStream, obs.toggleRecord, obs.switchScene (current scene). obs.toggleSourceVisibility has no live state today, so it keeps a single color (gap reported). Stateless keys are saved without `activeColor` (setKey replaces the key, so a stored one is dropped). RED: core `key-colors.test.ts` 2/2, desktop API round trip 1/1, mobile `key-colors.test.tsx` 2/3 failing; GREEN: core 156, desktop 161, mobile 291, typecheck clean. Inspector preview shows the off color only (on-color preview skipped).
- [x] T6 — Confirm before starting a recording or a stream from a key or the inspector's Test button (mobile UI only); tests. Reason: user request 2026-11-11. Route: delegated (same writer). `useConfirmedRun` (components/StartConfirmation.tsx) wraps the key runner in App (keys, inspector and dialog Test) and DockApp: obs.toggleRecord / obs.toggleStream ask only while OBS is connected and reports them off; on, or state unknown, runs as before. No explicit "start" action type exists in core, so that branch has nothing to apply to. RED: new `apps/mobile/test/start-confirmation.test.tsx` 5/7 failing (the 2 "stops at once" cases already passed); GREEN: root `npm run typecheck` exit 0, `npm test` core 156, desktop 161, electron 19, mobile 298 all passing.

## Acceptance
- Choosing e.g. 6×4 shows 24 keys per page on every board, on desktop and phone; existing keys keep their positions.
- Shrinking reflows overflowing keys without losing any; impossible shrinks are refused with a message.
- `npm run typecheck` and `npm test` pass.

## Delivery
Strategy: ask-on-risk. Forecast ≈ 600–800 authored lines across three work-unit commits on `feat/premium-ux-redesign`.

## Progress
- Prior unrelated UI fixes committed as ec2d106.
- T1 5041fcb, T2 1cea157, T3 05d1f00, T4 404efb0, T5 315f9db.
