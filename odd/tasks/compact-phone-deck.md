# Compact phone deck

## Objective
On a phone (especially held sideways, ~390–430 CSS px tall), the Deck shows every key of the current board without scrolling, keeping only what is essential on screen.

## Problem / why
Device capture (Samsung, 1080×2400, landscape, 2026-11-11): the header row, the ad bar and the left rail take ~35% of the height; the third key row is cut off; empty slots and the "+" add tile take space during normal use; two volume sliders take two full key columns.

## Design decisions
- Compact layout triggers on short or narrow viewports (container/media query on height ≤ ~540px or width ≤ ~600px), so the APK and phone browsers both benefit; tablet/desktop layouts stay unchanged.
- One slim top bar: board picker + connection status; editing tools (grid size, add, back) move behind an edit toggle/menu and are hidden while playing.
- The sponsor line stays visible (monetization) but becomes a slim single-line strip (≤ 28px) without the duplicated text.
- While playing, empty slots and the "+" add tile are hidden; keys fill the available area (rows/columns derived from the board, sized to fit with no scroll; minimum touch target 48px).
- Volume keys move out of the grid into a slim vertical mixer strip at the side (icon, percent, slider, muted state kept), so the grid gets the full width.
- Left navigation rail becomes narrower (icons only, ≥ 48px targets).

## Tasks
- [x] C1 Compact layout: slim top bar, edit tools behind a toggle, slim ad strip, narrow rail. Route: delegated (one writer, 2+ non-trivial files). Commit 31dc1a6.
- [x] C2 Play-mode grid: hide empty slots/add tile, fit keys without scroll. Route: delegated. Commit ad92c9e.
- [x] C3 Side mixer strip for volume keys on compact screens. Route: delegated. Commit 804f493.

## Acceptance criteria
- At 915×412 and 800×360 (landscape) and 412×915 (portrait) every key of a 4×3 board plus two volume keys is visible without scrolling, with ≥ 48px targets.
- Editing (add key, grid size, key menu) still reachable through the edit toggle.
- Tablet/desktop layouts unchanged; `npm run typecheck`, `npm test`, `npm run build -w @speed-deck/mobile` pass.

## Progress and evidence
- Compact = `(max-height: 540px)` or `(max-width: 600px)` (`COMPACT_*_QUERY`); App adds `.app-compact`, BoardPlayer gets `compact` and draws `.deck-compact` / `.deck-playing`. Deck space only; Voice is unchanged.
- C1: an Edit keys toggle (pencil, aria-pressed; check and accent fill while editing) sits after the status icon. While playing: no grid size, no new page, no add tile, no key menus or long-press moves, and no pager for a one-page board. Rail 56px with 48px targets; the sponsor line is one 32px row without the repeated detail, and on its side it moves into the top bar. Test-first: `test/compact-deck.test.tsx` RED 4 failed, then GREEN; `compact-space` test updated to toggle editing.
- C2: playing draws only keys, each placed on its own cell (`--cell-row/--cell-column`), on the columns/rows they reach (trailing empty ones dropped, inner gaps kept, transposed upright); `--key-min` 48px on phones. RED 3 failed, then GREEN.
- C3: playing moves volume keys to a `role="group"` "Volume" mixer: upright faders beside the keys on its side, horizontal rows under them upright; colour, icon, level and muted look kept; editing and tablets keep them in the grid. RED 2 failed, then GREEN; `volume-key` transposed test now toggles editing first.
- Checks at each commit: `npm run typecheck` exit 0; `npm test -w @speed-deck/mobile` 50 files, 435 tests passed (final); `npm run build -w @speed-deck/mobile` exit 0.
- Visual (headless Chrome, fake desktop API, 4x3 board with 8 keys + 2 volume keys and the device-like 6x3 board): no scroll and nothing off screen at 915x412, 800x360, 412x915; smallest target 58px; 1024x768 pixel-identical to the base commit. Before, 800x360 scrolled with 3 keys off screen.

## Next step
Check on the Samsung device (APK) with Android system bars; then the backlog.
