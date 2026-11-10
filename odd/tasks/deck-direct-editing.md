# Deck direct editing

Locator: `odd/tasks/deck-direct-editing.md` · Engram mirror: `odd/deck-direct-editing/tasks`
Branch: `feat/premium-ux-redesign`

## Objective

Editing a deck feels like a premium Stream Deck app: tap **+** on an empty key, pick an action in a modal, done. No separate editor screen, and a minimal visual language.

## Problem

- Adding an action requires entering the three-pane "Board editor" (wide screens) or an edit toggle (narrow). Empty slots are inert outside edit mode (`BoardPlayer.tsx:94-111`).
- The editor looks like a website form: purple accent left borders, red outlined destructive buttons always visible, dashed empty slots, cards nested inside cards.

## Why

User feedback (2026-11-10): "debería ser solo el + y un modal con opciones"; purple borders "parecen más un error"; "debe ser muy minimalista, muy simple".

## Scope (authorized)

- Always-visible **+** on empty slots in play mode, opening a two-step add-key modal (action picker grid with search and categories → params/label/icon/color when needed; actions without params save directly).
- Context menu on existing keys (right-click / long-press, plus keyboard access): Edit, Delete (with confirmation). Drag to reorder keys in the player.
- Remove the three-pane `BoardEditor` and the edit-mode toggle; board management (new, rename, delete, restore default) moves to a dropdown menu on the board name. Page add stays reachable from the pager.
- Visual cleanup: one surface level, no accent borders, no colored outlines, destructive actions only inside menus/confirmations, empty slot = subtle filled tile with faint + and no border.

Out of scope (second delivery): custom `Select`, toggle switches and segmented controls replacing native form controls.

## Constraints

- UI copy/i18n in existing locale files (es + any others present); code and comments in English.
- Keep accessibility: native `<dialog>` with focus trap/return, keyboard path to every action (context menu reachable without a mouse), live-region announcements.
- Reuse `KeyEditorForm`, `ActionParamsFields`, `key-draft.ts`, `use-deck.ts`.
- Works in phone PWA, dock view and Electron window.

## Tasks

- [x] T1 — Add-key flow: empty slots show + in play mode; two-step add modal (picker → details). Tests in `board-player.test.tsx`.
  - Evidence: RED — 4 new/updated tests failed (no "Add key 2" dialog, + only in edit mode). GREEN — 239/239 tests, typecheck and build pass. New `ModalDialog` shell (title, close, live region, focus return) and `ActionPicker` tile grid; `KeyEditorDialog` adds in two steps (parameterless actions save at once) or edits. Commit: `79077a7`.
- [x] T2 — Key context menu (Edit / Delete with confirm) via right-click, long-press and keyboard; drag-to-reorder in the player. Tests.
  - Evidence: RED — 7 tests failed (no menu, no long press, no drag in the player). GREEN — 241/241 tests, typecheck and build pass. `KeyMenu` (role=menu, arrows/Home/End, Escape/Tab close and refocus the key, outside press closes); long press 500ms for non-mouse pointers swallows the ending click; Shift+F10 / ContextMenu key; a hover/focus "more" button (tabIndex -1, "Options for key N"). Drag-to-swap only with a fine pointer (iOS long press would start a native drag); touch users move keys via Edit → "Move to position". Delete removed from the edit dialog. Commit: see next task.
- [ ] T3 — Remove `BoardEditor` three-pane screen and edit toggle; board dropdown menu (new, rename, delete, restore); page add from pager. Update/remove obsolete tests.
- [ ] T4 — Minimal visual cleanup of deck, menus and modal styles (tokens, no accent borders/outlines/dashes, no nested cards).
- [ ] T5 — Rebuild mobile + Electron app and relaunch for the user to try.

## Route per task

- T1–T4: delegated direct, one writer (2+ non-trivial files across components, styles, i18n, tests).
- T5: inline (build commands).

## Acceptance criteria

- From play mode, tapping + on an empty slot and choosing a parameterless action creates the key without any other screen.
- Actions with params show their fields in the same modal; Save creates the key.
- Existing keys can be edited and deleted from a context menu reachable by mouse, touch and keyboard.
- No "Board editor" screen remains; board management lives in a menu.
- No purple accent borders, outlined red buttons or dashed slots in the deck UI.

## Checks

- `npm test -w @speed-deck/mobile`, `npm run typecheck -w @speed-deck/mobile`, `npm run build -w @speed-deck/mobile`.
- RDD: off (global) → no native review; parent structural readback + spot check.

## Delivery

- Forecast: ~800–1000 authored changed lines (exceeds ~400 budget). Strategy: `ask-on-risk`; chain strategy to be asked before any PR. Push/PR remain the user's decision.

## Progress

- 2026-11-10: document created; exploration done (see Problem).
