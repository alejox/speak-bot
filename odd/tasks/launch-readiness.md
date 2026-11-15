# Launch readiness

Status: IN PROGRESS (authorized by the owner 2026-11-14). Branch `feat/launch-readiness` from `main` (v0.1.0).

## Objective
Get the computer app ready for a public launch: fix the two grid problems the owner reported, review the product as a UX/UI expert and as a software architect, fix what blocks a launch, and hand over Windows and macOS installers.

## Owner requests (2026-11-14)
1. "Every square should have the +, so I do not have to look for which button brings it up."
2. "Check the Voice grid, it must fill the same way as the Deck."
3. Expert UX/UI review and software-architecture review.
4. Windows and macOS installers for the market launch.

## Observed before the change (standalone web UI, 1024x768, Spanish)
- Deck 5x3 with two keys: exactly one empty cell shows +; the other twelve are blank tiles.
- Voice 5x2 with eight phrases beside the composer column: keys are 81px squares floating in the middle of a 468x596 area, with long phrases cut ("Un momento…", "No puedo hablar, pe…"), while the Deck's keys fill their area.

## Decisions (parent, to be confirmed by the owner in the hand-over)
- Every empty cell that is drawn is an add button wherever the board can be edited in that view. Views that drop empty cells to enlarge keys (compact Deck while playing) keep doing so.
- On wide screens the Voice grid fills its area: cells stretch in both directions within an aspect limit instead of staying small squares, so phrase keys are larger and long phrases fit.
- Review findings are fixed here only when they block a launch and are low risk; the rest is reported as follow-ups.

## Tasks
- [x] L1 + on every empty cell; Voice grid fills its area on wide screens. Route: delegated writer.
  Evidence: RED 25 failing then 586 mobile tests passing; parent re-ran typecheck and the mobile suite and viewed the after screenshots. Measured in headless Chrome, light and dark, default boards: Deck empty cells with + went from 1 to 13, key sizes unchanged; Voice keys went from 80.8/132/164/190 px squares to 80.8x113, 132x185, 164x230 and 222x310 at 1024, 1280, 1440 and 1728 wide, grid top offset from about 200px to 20px, no truncated label in the 16 measured views, no page scroll. + glyph contrast at rest 3.93:1 light, 4.22:1 dark.
  Open for the owner: the + also shows on phone Voice while playing (a missed tap opens the add dialog); with two rows the 1.4 aspect limit leaves empty space under the Voice grid. Not seen in a browser: the OBS dock, a Deck opened from another device.
- [x] L2 Software-architecture review (read-only). Route: delegated reviewer. Verdict: ready with fixes. No RCE, file access, secret leak or cross-site hole found; request guard, traversal, body limits and Electron hardening checked.
  Blockers: (1) a refused WebSocket upgrade followed by a TCP reset raises an uncaught EPIPE and kills the server (reproduced 200/200); (2) a damaged `boards.json` silently becomes the default boards, a second damage loses the backup, no fsync before rename; (3) locally built installers are version 0.0.0 and would auto-update to older code; (4) no LICENSE and no third-party notices in the shipped apps.
  Should fix soon: no refetch of boards/settings/OBS state after a WebSocket reconnect (a stale "off" toggle can stop a live stream); release workflow token scope; boards file version never read; no privacy section, sponsor feed fetched when ads are removed; Android follows any mDNS announcement with the saved id; CI has no Android or packaging job.
- [x] L3 UX/UI review of the result (read-only). Route: delegated reviewer. Verdict: ready with fixes. Driven in headless Chrome: standalone UI plus the server from source with a temporary data directory, 60+ views (desktop and phone sizes, both themes, both languages, Extra large). Not seen: OBS connected, the Electron window and tray, the Android app, real touch gestures, real speech audio.
  Blockers reported: (1) "Remove ads" leads to a text-only dead end while the Android app is unpublished (owner already chose to leave this as is on 2026-11-14: not changed); (2) "Save and connect" in the OBS section does not connect while its checkbox is unticked, and the offline key reason points to Settings instead of OBS; (3) on a paired phone Voice fails silently when the computer drops (no fallback, error only in a hidden status); (4) the key inspector's Save is below the fold at 1440x900 and Enter does not save; (5) Voice keys shrink at 1024px and with Extra large text (12px labels, mid-word breaks in the Deck).
  Polish reported: stale status text inside dialogs; phone edit mode gives no visible change; + misfires on phone Voice while playing; two-line clamp on roomy landscape keys; inspector Escape/focus/tab order; no visible page indicator; duplicate voices in the picker; Connect layout; dark placeholder contrast 3.38:1; saving twice duplicates a key; new-board name not selected.
  Disagreements with past decisions (reported to the owner, not changed): stopping a live stream never asks for confirmation; the phone status line is hidden; the Deck opens first; Deck boards as top-level menu items; the composer in a side panel.
  Kept as is: keyboard path, names and roles, delete confirmation, disconnect banner, no overflow in any swept view, ES/EN parity.
- [x] L4a Architecture fixes. Route: delegated writer. Refused upgrades no longer crash the server (reviewer's script: 0 crashes in 3x200, was 200/200) and both entry points log uncaught errors and keep running; JSON stores fsync before rename, keep `.last-good`, move damaged files to `.corrupt-<time>` (max 5) and restore from last-good, with a dismissible notice on the computer; version 0.0.0 is a development build with updates disabled; `THIRD-PARTY-NOTICES.txt` (72 packages, Inter OFL) is generated at build, shipped in the web build and Electron resources and linked from Settings; the UI refetches boards, settings, OBS, ads and update state on every reconnect and disables live-state keys while the link is lost; release workflow build jobs are read-only; the sponsor feed is not fetched while ads are removed; README has a Privacy section.
  Evidence: RED per fix then GREEN; parent re-run: typecheck clean, core 237, desktop 354, electron 87, mobile 611 passing; workflow permissions parsed. Writer packaged a 0.2.0 macOS dmg with the notices inside.
  Open for the owner: the product's own LICENSE is not chosen; `lazy-val@1.0.5` ships no licence file anywhere, a standard MIT text with a note was written for it and needs approval; last-good is one change behind, so a restore can lose the most recent change (the notice says so).
  Not verifiable here: fsync under real power loss, Electron's dialog suppression in the packaged app, the workflow on GitHub. Follow-ups: Android native libraries are not in the notices; last-good and corrupt copies of settings can hold the OBS password until the next save; notices are not precached offline.
- [ ] L4b UX fixes. Route: delegated writer.
- [ ] L5 Full checks, then Windows and macOS installers.

## Checks
`npm run typecheck`, `npm test`, `npm run build`, browser check of Deck and Voice at 1024, 1440 and phone sizes, installers built and inspected.
