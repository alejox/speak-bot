# Multi-action keys and folders

## Objective
Two new key types: a multi-action key that runs several actions in order with optional waits, and a folder key that opens a sub-board of keys with a way back.

## Why
User request 2026-11-11 after the competitor research (Elgato Multi Action and Folders; Touch Portal; Companion): one press for a whole routine (e.g. switch scene + unmute mic + start recording), and grouping keys without spending a whole board (also useful for Voice vocabulary categories).

## Design (parent defaults, conventional; the user may adjust)
### Multi-action
- Action `system.multiAction {steps}`: 2–10 steps; each step is an existing action (with its params) plus `delayMs` before it (0–10 000 ms, step 1 delay allowed). Allowed on Deck boards. Steps may be any action allowed on the board EXCEPT client-only navigation actions (next/previous page, go to page, go to board, open folder) and another multi-action (no nesting).
- Runs on the desktop, sequentially, through the existing executor; a step that fails is reported and the remaining steps still run (like Elgato). One running instance per key: pressing the key while it runs is ignored. Start-recording / start-stream confirmation (T6) is asked once, before the whole sequence, when any step would start recording or streaming.
- The key shows a running state (existing on-state tint + dot) while the sequence runs.
- Editor: ordered list of steps; add step (action picker), edit its params inline, delay field, move up/down, remove. Default label "Multi-action" / "Multiacción", icon from the fixed set.
### Folders
- A folder is a hidden child board of the same kind as its parent (Deck or Voice), with the same grid size as that kind. It never appears in the sidebar or the board pill menu.
- Key action `nav.openFolder {folderId}` (client action). Creating a folder key creates the empty child board. Inside a folder, slot 0 is a fixed, non-removable "Back" key (returns to the parent board and the page it was opened from); the rest of the slots are normal. Folders may be nested (max depth 3).
- Deleting a folder key asks for confirmation and deletes the folder board and everything nested in it. Moving or copying a folder key keeps the same folder.
- The header shows the path (e.g. "Deck › Escenas") so the user knows they are inside a folder.
- Grid resize per kind applies to folder boards too (reflow keeps slot 0 for Back). Folder boards count toward MAX_STORED_BOARDS.
- Works on the desktop and paired phones (boards sync as today) and in phone-only mode.

## Tasks
- [x] F1 — Core: folder boards (kind, parent link, hidden), `nav.openFolder`, Back key rules, cascade delete, depth limit, reflow and grid rules; multi-action action shape and validation; tests. Route: delegated. Commit `bb61e70`. RED: new `folders.test.ts` + `multi-action.test.ts` 22/23 failed with the source changes stashed; GREEN: core 18 files / 221 tests; `npm run typecheck` clean, `npm test` all workspaces green (desktop 250, electron 24, mobile 384).
- [x] F2 — Desktop: sequential multi-action runner with delays, failure reporting, one-run-per-key, running-state events; API for folder create/delete if needed; tests. Route: delegated. Commit `8cb270b`. RED: `multi-action-runner.test.ts` (fake timers) + `folders-api.test.ts` 8/8 failed before the runner and route existed; GREEN: desktop 33 files / 258 tests; `npm run typecheck` clean, `npm test` all workspaces green (core 221, electron 24, mobile 384).
- [x] F3 — Mobile: folder navigation + Back + breadcrumb, folder key creation/deletion; multi-action editor and running state; start confirmation for sequences; en/es; tests. Route: delegated. Commit `F3_HASH`. RED: `folders-and-multi-actions.test.tsx` 8/8 failed with the mobile source changes stashed (tests written alongside the implementation, RED observed retroactively); GREEN: mobile 48 files / 392 tests; `npm run typecheck` clean, `npm test` all workspaces green (core 221, desktop 258, electron 24). Pending manual checks: folder Back/breadcrumb on a real phone held upright (transposed grid), multi-action against a live OBS (Intro: scene, wait 1 s, unmute, record after one confirmation).

## Acceptance
- A multi-action "Intro" switches scene, waits 1 s, unmutes the mic and starts recording (after one confirmation).
- A folder key opens its sub-board with Back in the first cell; Back returns to the same page; deleting the folder key removes the folder.
- `npm run typecheck` and `npm test` pass.

## Implementation notes (F1)
- `Board.parentId` marks a folder; the Back key is a stored key `{ slot: 0, action: { type: "nav.folderBack" } }` (`FOLDER_BACK_KEY`), not user-selectable (`ActionDefinition.userSelectable: false`), rejected anywhere else.
- `createFolder` creates the folder board and its `nav.openFolder` key in one write; the folder is named after the key label and renamed when the key's label changes.
- Cascade delete: every key mutation drops folders no key opens any more (`withoutUnreferencedFolders`), so clearing or replacing a folder key removes the folder and everything inside. A folder key may only open a folder of its own board.
- Limits: `MAX_BOARDS` counts boards that are not folders; boards + folders together stay within `MAX_STORED_BOARDS`.
- Multi-action: `system.multiAction { steps: { action, delayMs }[] }`, 2–10 steps, 0–10 000 ms; steps must be server actions other than volume sliders and multi-actions, and allowed on the board's kind (`isKeyActionAllowedOnBoard`).
- New icon id `folder` (Lucide Folder); multi-action default icon `clock`.

## Implementation notes (F2)
- `POST /api/actions/execute` takes an optional `key: { boardId, slot }`. A multi-action answers 202 and runs in the background; the same key (or, without a key, the same steps) pressed again while it runs answers 200 `{ ok: true, ignored: true }`.
- Events: `multi-action` with `runId`, `key`, `state: "start" | "end"`, and on end `failures: [{ index, type, message }]`. Failed steps are logged; the rest still run.
- `POST /api/boards/:id/folders { slot, label, icon?, color? }` → 201 `{ folder, key }`; deleting the key (`DELETE /api/boards/:id/keys/:slot`) deletes the folder through the core cascade.

## Implementation notes (F3)
- Navigation remembers where each folder was opened from (in memory), so Back returns to that page; after a reload inside a folder, Back opens the parent on its first page.
- Inside a folder the header shows a breadcrumb (`Deck › Scenes`) instead of the board pill; folders are excluded from the side menu, the board menu and the "Open board" picker; the side menu keeps the outer board active.
- The Back key has no menu, cannot be dragged and nothing can be dropped on it. A folder key's action cannot be changed in the editor (that would delete the folder); Delete asks "Delete this folder and all its keys?".
- Picking Folder creates the folder at once (named "Folder"/"Carpeta", renamed with the key label); Folder is not offered at depth 3.
- Multi-action editor: ordered steps with action, its details, "Wait before (seconds)" (decimals, 0–10), Move up/down, Remove step, Add step (max 10). Only a multi-action press sends its key ref; the key shows "Running"/"En curso" from `multi-action` events and failed steps are reported in the status line.
- README documents folders and multi-actions.

## Progress
- Created 2026-11-11.
- F1 done (core).
- F2 done (desktop).
- F3 done (mobile).
