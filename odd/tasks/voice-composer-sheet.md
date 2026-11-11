# Voice composer sheet

## Objective
The Voice space on a phone shows the phrase keys first; typing a new phrase happens in a modal sheet opened from one on-screen button, so the key grid stays clean.

## Problem / why
Device capture (Samsung landscape, 2026-11-11): the text box, Hablar, Detener and Guardar take ~40% of the height; the quick-phrase row plus the board header leave the phrase grid cut off. User request: "a button on screen that opens a popup/modal where the user can write and save phrases, to keep the key grid clean".

## Design decisions
- Applies with the compact layout (`COMPACT_*_QUERY`, the same condition as `odd/tasks/compact-phone-deck.md`); tablet/desktop keep the inline composer.
- Voice space while playing: slim top bar (board picker, edit toggle, pager only if several pages) + phrase grid fitted without scroll (same rules as the compact deck: no empty slots or add tile while playing).
- A floating "Write" button (pencil/keyboard icon, label, ≥ 56px, bottom-right, clear of the tab bar) opens a sheet: autofocused text box, big "Speak" button, "Save as phrase", recent phrases, close. Speaking keeps the sheet open so the person can keep talking; Enter speaks.
- While speech is playing, a floating "Stop" button is always visible (outside the sheet too).
- The quick-phrase row stays only if it fits; otherwise it moves into the sheet.
- Accessibility: the sheet is a modal dialog (focus trap, Escape/back closes, labelled), keyboard-safe on Android (sheet rises above the soft keyboard).

## Tasks
- [x] W1 Compact Voice layout: slim bar, edit toggle, fitted phrase grid. Route: delegated. Commit 582cb40.
- [x] W2 Composer sheet + floating Write and Stop buttons; long phrases shortened with an ellipsis (visual only). Route: delegated. Commit 6c0a962.
- [x] W3 Deck editing only on the computer: one exported `canEditDeck` flag (localhost hostname), applied in the Deck space; Voice stays editable everywhere. Route: delegated. Commit e2daaad.

## Accepted changes
- User (2026-11-11): a long phrase is shortened on its key with "…" (CSS clamp, two lines on phrase keys; quick-phrase and recent chips already one line), never by cutting the stored text: the key's name, tooltip (`title`), speech and edit form keep the whole phrase.
- User (2026-11-11): creating and editing the Deck (OBS keys) happens only on the computer; a page not served on localhost shows the Deck as configured. Voice stays editable on every device. Added as W3.

## Acceptance criteria
- At 915×412, 800×360 and 412×915 the phrase grid of a 4×3 board is fully visible without scrolling; Write and Stop reachable.
- Typing, speaking, saving a phrase and recent phrases all work from the sheet; tablet layout unchanged.
- `npm run typecheck`, `npm test -w @speed-deck/mobile`, `npm run build -w @speed-deck/mobile` pass.

## Progress and evidence
- W1: `App` passes `compact` to the Voice BoardPlayer too (`isCompactSpace = isPhoneSized && space !== null`) and shows the Edit keys toggle there; editing is remembered per space (`editingSpaces`). The quick phrases stay in the strip (top bar on its side, own row upright), since they fit. Test-first: `test/compact-voice.test.tsx` RED 4 failed, then GREEN; phone tests that edit Voice keys (`compact-space`, `touch-move`) now toggle Edit keys first. Checks: typecheck exit 0; 52 files, 447 tests passed; build exit 0.
- W2 (checks: typecheck exit 0; 52 files, 458 tests passed; build exit 0): on a phone, Voice hides the inline composer (`usesComposerSheet = isCompactSpace && voice && !isWorkspace`) and shows `VoiceActions` beside the keys (a column at the right on its side, a row under the keys upright; never over them): Write (pencil, 56px) and Stop while speech plays. Write opens `ComposerSheet` (the existing `ModalDialog`, so focus trap, Escape/back and focus return come with it) holding the same `Composer` and `RecentPhrases`; speaking keeps it open. The sheet docks to the bottom and rises by `--keyboard-inset` (from `visualViewport`, `useKeyboardInset`), max height `100dvh` minus it, its body scrolls; on its side text, Speak, Stop and Save share one row. Labels reuse the existing names ("Save as key" / "Guardar como tecla", "Close"); new: "Write" / "Escribir". Long phrase keys clamp at two lines; `BoardKey` sets `title` to the full label when it is long. Test-first: 10 new tests RED, then GREEN; `compact-space` and `shell-overflow` updated.
- Visual (headless Chrome, `vite preview`, local mode, 4x3 board with 8 phrases incl. a long one, Spanish): 915x412, 800x360, 412x915 dark and light, sheet closed, open and with a simulated keyboard (45% inset): no scroll, 8 keys on screen, none under the actions, smallest key 122px; with the keyboard the text box and Hablar stay visible. 1024x768 (dark, light) identical to the base commit except inside the long-phrase key (3 lines -> 2 with an ellipsis, the requested change).
- W3: `canEditDeck(hostname)` in `src/app/edit-capability.ts` (exported; true on localhost, 127.0.0.1, ::1; false on a LAN address or the Android app's `appassets.androidplatform.net`; an unknown host, i.e. no `AppServices.servedFrom`, keeps editing). `createAppServices` sets `servedFrom` from `location.hostname`; App computes `maySpaceBeEdited` once and gates `canEditBoard` (add tile, key menus, long-press moves, grid size, new page) and the Edit keys toggle with it. Voice is untouched. Volume keys still play (mixer on a phone, sliders on a tablet). Not gated (not in the request): the board menu's create/rename board items and the empty-space "New board" button. Test-first: `test/deck-editing-host.test.tsx` RED 2 failed (module present, App unchanged), then GREEN 5.

## Next step
Check on the Samsung (APK and phone browser): sheet above the real soft keyboard, Write/Stop reach, Deck read-only away from the computer. Decide whether board create/rename on a phone should follow `canEditDeck` too.
