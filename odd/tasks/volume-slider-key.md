# Volume slider key

## Objective
A Deck key that controls the volume of one OBS audio input (music, mic, any source with audio) with a slider, spanning several grid cells: 2–3 rows tall and 1–2 columns wide, size chosen by the user, aligned exactly to the grid cells including the gaps.

## Why
User request 2026-11-11 ("controladores de volumen tipo slide, ejemplo para la música o una fuente"; "2 o 3 filas de cuadro de una columna o 2, que el usuario pueda ajustar este alto y que se alinee con los recuadros").

## Design
- Keys gain an optional span (`rows` 1–3, `columns` 1–2; default 1×1). In this task only the volume action may have a span other than 1×1 (validated in core), so ordinary keys are unchanged.
- The key's slot is its top-left cell. The cells it covers (same page, right and down) are reserved: no other key may sit there, the + never offers them, setKey/moveKey/reflow treat them as occupied. A span must fit inside one page (no crossing the right or bottom edge).
- Grid resize reflow treats a spanning key as one block: keep its position if the whole block fits, else the first free position in reading order where the whole block fits; refuse the resize if none. Spans larger than the new grid are clamped (rows ≤ grid rows, columns ≤ grid columns).
- Moving (drag, touch, move-to): the destination must have room for the whole block; a swap with a 1×1 key only when that key sits on the destination top-left and the rest of the block is free; otherwise the move is refused with a message.
- Display: CSS grid placement (`grid-row`/`grid-column` span) so the slider lines up with the cells and gaps. The transposed portrait display swaps the span (rows↔columns).
- Action `obs.inputVolume {inputName}`: shows the input name and current volume (%) and a slider (vertical when taller than wide, horizontal otherwise). Dragging sends throttled set-volume requests (≈ every 60 ms) plus the final value on release. Live updates from OBS (`InputVolumeChanged`) move the slider when the user is not dragging. Volume curve mirrors the OBS mixer fader (verify in obs-studio source); percent shown is the fader position.
- Editor: input select (same source as the existing mute-input action), plus "Height" (1–3 rows) and "Width" (1–2 columns) choices; refuses a size with no room and says why.
- Runs through the desktop only (like other OBS actions).

## Tasks
- [x] S1 — Core: key span model, validation, occupancy (setKey, moveKey, + slot, reflow with blocks), `obs.inputVolume` action; tests. Route: delegated (writer trigger: several non-trivial files).
- [x] S2 — Desktop: OBS get/set input volume and `InputVolumeChanged` relay, API for set volume; tests. Route: delegated (same writer).
- [x] S3 — Mobile: spanning cell rendering (incl. transposed portrait), slider component with throttled updates and live sync, editor fields, move rules for blocks; en/es strings; tests. Route: delegated (same writer).

## Acceptance
- A 1×3 slider key on a 5×3 board occupies a full column, aligned with the cells; dragging it changes the OBS input volume and OBS changes move it.
- Other keys cannot be placed on covered cells; resizing the grid never loses or overlaps keys.
- `npm run typecheck` and `npm test` pass.

## Progress
- Created 2026-11-11.
- S1 ed58d2e: RED 20/20 failing in `packages/core/test/key-span.test.ts`, then GREEN; core 188 tests passing.
- S2 fb8bb77: RED 5 failing (obs connection manager, obs API, boards API no-room), then GREEN; desktop 205 tests passing.
- S3: the commit that adds this note. RED 12/12 failing in `apps/mobile/test/volume-key.test.tsx`, then GREEN; mobile 370 tests passing.
- Fader curve verified against obs-studio: `libobs/obs-audio-controls.c` (`log_def_to_db`/`log_db_to_def`, 0 dB to −96 dB, `dB = 6 − 102 · 17^(−position)`) and `frontend/components/VolumeControl.cpp` (`obs_fader_create(OBS_FADER_LOG)`).
- Decisions inside the design: pressing a volume key on the desktop (`POST /api/actions/execute`) answers 400 "client-action", since the slider uses `GET/PUT /api/obs/inputs/:name/volume`; stored spans that overlap or cross the page fall back to 1 × 1 (no key is dropped); the input field keeps the shared label "Audio input" / "Entrada de audio" of the mute action.
- Known limits: in the compact dock layout (3–4 automatic columns) a spanning key spans that many cells wherever it lands instead of its board position; a stale OBS echo of an earlier throttled value may briefly move the slider right after release.
- Pending manual checks: a 1 × 3 key on 5 × 3 lines up with cells and gaps (390×844 upright, 844×390, 1280×800); dragging on a real phone neither scrolls nor moves the key; vertical slider direction (bottom = silent) in Safari and Chrome; live OBS volume follows both ways.
