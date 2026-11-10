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
  - Evidence: RED — 7 tests failed (no menu, no long press, no drag in the player). GREEN — 241/241 tests, typecheck and build pass. `KeyMenu` (role=menu, arrows/Home/End, Escape/Tab close and refocus the key, outside press closes); long press 500ms for non-mouse pointers swallows the ending click; Shift+F10 / ContextMenu key; a hover/focus "more" button (tabIndex -1, "Options for key N"). Drag-to-swap only with a fine pointer (iOS long press would start a native drag); touch users move keys via Edit → "Move to position". Delete removed from the edit dialog. Commit: `93fc018`.
- [x] T3 — Remove `BoardEditor` three-pane screen and edit toggle; board dropdown menu (new, rename, delete, restore); page add from pager. Update/remove obsolete tests.
  - Evidence: RED — new `board-menu.test.tsx` 9/13 failed (edit toggle still present, no "Board options" menu, no "New page" in the player). GREEN — 235/235 tests, typecheck and build pass. Removed `BoardEditor`, `BoardList`, `ActionLibrary`, `RestoreDefaults`, `WIDE_EDITOR_QUERY`, the edit toggle and `isEditing`, `board-editor.test.tsx` (its kind/OBS/page-limit/board cases moved to `board-menu.test.tsx`) and dead CSS/i18n. Shared `Menu` (+ `useOutsidePress`) used by `KeyMenu` and the new `BoardMenu` (⋯ button next to the board selector; name/confirm dialogs on `ModalDialog`; Delete disabled for the only board). Pager "next" becomes "+ New page" past the last page. Follow-up outside the authorized surface: `README.md` still describes edit mode (lines ~69, 79, 146). Commit: `4c51fbc`.
- [x] T4 — Restyle to the user's design reference (`/Users/alejox/Downloads/Interfaz Speed Deck en modo oscuro.png`, 2026-11-10): wide screens (≥1000px) get a right-hand key inspector panel (large key preview, action, color swatches, name, primary Save) instead of the modal; phones keep the modal. Large 4-column keys (big icon above label, no mid-word wrapping), color gradient fills, board selector pill with chevron, a single + tile after the last key, flat low-contrast surfaces, one filled primary button. Not taken from the reference: Pro upsell, Plugins, Automations.
  - Evidence: RED — 25 tests failed (new `inspector.test.tsx`, single-+ tests, board pill expectations across spaces/dock/i18n/board-menu/player tests). GREEN — 241/241 tests, typecheck and build pass. `KeyInspector` side panel (≥1000px, `INSPECTOR_QUERY`): live preview tile + name from the draft via `KeyEditorForm` `onDraftChange`/`variant="inspector"` (no duplicated draft logic; `actionOnlyKey` shared by modal and wide picker); + opens `ActionPickerDialog`, parameterless actions save and get selected, others land in the panel. Plain tap still runs keys. Board pill (kind icon, name, chevron; name "Board: X") replaces the native board select and opens the board menu (boards as menuitemradio, grouped by kind in the dock, then management). One + per page (after the last key, else first gap); other empty slots are blank drop targets. Keys: 4 columns, 36px icons, 2-line clamp without mid-word breaks, 20px radius, flat surface tokens, colour gradient via `--key-color`. Visual check in a real browser not done (T5). Commit: see Progress.
- [x] T5 — Rebuild mobile + Electron app and relaunch for the user to try.
  - Evidence (parent, 2026-11-10): spot check 241/241 tests, typecheck clean; mobile build, electron bundle and `electron-builder --dir` succeeded; app relaunched. Visual check pending with the user. No source change, so no commit.
  - Pending follow-ups: README edit-mode references (~L69, 79, 146); open questions on empty inspector state, single + per page for keyboard users, gradient on light colors. Engram mirror pending (auto mode could not check mem_save).
- [x] T6 — Always-visible inspector in the Deck on wide screens (user decision 2026-11-10): with no key selected the panel shows an empty state (faint + tile, "New key", one hint line, full-width primary "Add key") that opens the same action picker for the slot the page's + targets; parameterless actions save and get selected. Panel fixed at 340px and always reserved in the Deck so the grid never jumps; keys shrink (4 columns at 1280px with the sidebar, 3 below ~1100px via the existing container query). Narrow screens and the Voice space unchanged.
  - Evidence: RED — 2 new tests in `inspector.test.tsx` failed (no complementary "New key"). GREEN — 246/246 tests, typecheck and build pass. `BoardPlayer` computes its add slot once (`addIndexOnPage`, also used for the + tile, including the blank new page) and reports it via `onAddSlotChange`; `KeyInspectorEmpty` renders the empty state. Full page: Add key is disabled and described by "This page is full. Go to another page to add a key." Visual check in a real browser not done. Commit: see Progress.
- [x] T7 — App shell and Deck workspace like the reference (user request 2026-11-10: "que ese lateral quede desde arriba hasta abajo, así como el sidebar … quita textos en el espacio de trabajo"). From 720px the header (new mark + "Speed Deck") sits at the top of the sidebar, which runs the full window height; the main area scrolls on its own. In the Deck on wide screens (≥1000px) the inspector is a full-height column docked to the right edge (340px, sidebar surface, no card), rendered outside `<main>` as its own complementary landmark. The Deck workspace shows only the board pill, a compact status icon, the pager arrows and the keys: the "Deck" heading, the status line and the page number stay for screen readers only (visually hidden), notes move into the icon (`DeckStatusIndicator`: name and tooltip carry the full status; with a note it becomes a button to Settings described by the note). Keys are a 5 × 3 page, each the largest square that fits the grid area's width and height (container query units, capped at 190px), centred, with no page scroll. Narrow screens, the Voice space and the dock unchanged (status pills and notes still shown there).
  - Evidence: RED — new `deck-workspace.test.tsx` 5/6 failed (visible heading and status, no indicator, inspector inside `main`). GREEN — 252/252 tests, typecheck and build pass. Headless Chromium screenshots of the built app at 1280×820 and 1920×1080: three full-height columns, 5 × 3 keys, no scroll. Commit: see Progress.

## Route per task

- T1–T4: delegated direct, one writer (2+ non-trivial files across components, styles, i18n, tests).
- T5: inline (build commands).
- T6: delegated direct, one writer (App, BoardPlayer, new component, styles, i18n, tests).
- T7: delegated direct, one writer (App, DeckStatus, SectionView, BoardPlayer, layout/deck/editor CSS, tests).

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
- 2026-11-10: T1 `79077a7`, T2 `93fc018`, T3 `4c51fbc`, T4 committed (hash in git log: `feat(mobile): restyle the deck to the reference with a key inspector and board pill`). Next: T5 (parent).
- 2026-11-10: T6 committed (`feat(mobile): keep the key inspector open in the deck with an add-key empty state`).
- 2026-11-10: T7 committed (`feat(mobile): dock the sidebar and inspector full height and keep the deck workspace to keys`).
