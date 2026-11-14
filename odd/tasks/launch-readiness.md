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
- [ ] L3 UX/UI review of the result (read-only). Route: delegated reviewer.
- [ ] L4 Fix launch blockers from L2 and L3. Route: decided after the findings.
- [ ] L5 Full checks, then Windows and macOS installers.

## Checks
`npm run typecheck`, `npm test`, `npm run build`, browser check of Deck and Voice at 1024, 1440 and phone sizes, installers built and inspected.
