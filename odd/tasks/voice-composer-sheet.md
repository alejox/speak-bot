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
- [x] W1 Compact Voice layout: slim bar, edit toggle, fitted phrase grid. Route: delegated.
- [ ] W2 Composer sheet + floating Write and Stop buttons; long phrases shortened with an ellipsis (visual only). Route: delegated.
- [ ] W3 Deck editing only on the computer: one exported `canEditDeck` flag (localhost hostname), applied in the Deck space; Voice stays editable everywhere. Route: delegated.

## Acceptance criteria
- At 915×412, 800×360 and 412×915 the phrase grid of a 4×3 board is fully visible without scrolling; Write and Stop reachable.
- Typing, speaking, saving a phrase and recent phrases all work from the sheet; tablet layout unchanged.
- `npm run typecheck`, `npm test -w @speed-deck/mobile`, `npm run build -w @speed-deck/mobile` pass.

## Progress and evidence
- W1: `App` passes `compact` to the Voice BoardPlayer too (`isCompactSpace = isPhoneSized && space !== null`) and shows the Edit keys toggle there; editing is remembered per space (`editingSpaces`). The quick phrases stay in the strip (top bar on its side, own row upright), since they fit. Test-first: `test/compact-voice.test.tsx` RED 4 failed, then GREEN; phone tests that edit Voice keys (`compact-space`, `touch-move`) now toggle Edit keys first. Checks: typecheck exit 0; 52 files, 447 tests passed; build exit 0.
