# Premium UX redesign: separate Voice from Deck

Status: IN PROGRESS. Authorized 2026-11-10: the user chose two spaces inside one app.
Branch: `feat/premium-ux-redesign`, stacked on `feat/stream-deck-boards` like the existing PR chain.
Next step: T2.

## Objective

Turn Speed Deck into two clearly separated experiences that share one engine:

- **Voice**: an AAC surface for people who cannot speak (type or tap, the device talks).
- **Deck**: a control surface for OBS (and later the computer).

## Problem (observed 2026-11-10, app running standalone at 1024px and 375px)

1. **Voice and control share one board.** `Board` has no kind or purpose field
   (`packages/core/src/domain/board.ts:64-70`), so `voice.speak` and `obs.*` keys live in the same
   `keys` array. The default "Communication" board ships two caption keys that are greyed out with
   "Requires the computer app" on the first screen a non-speaking user sees
   (`packages/core/src/domain/default-board.ts:17-23,44-50`).
2. **The board editor breaks at about 1024px.** The three-pane layout squeezes the grid until keys are
   slivers and labels wrap one letter per line (`apps/mobile/src/styles.css:837-855`).
3. **Speaking is a secondary tab.** The app opens on "Board"; the composer is one section away and its
   quick keys are just the first five `voice.speak` keys of the current board
   (`apps/mobile/src/components/QuickKeys.tsx:8-13`).
4. **Keys do not scan.** Every phrase uses the same grey tile and the same speech-bubble icon. There is
   no colour coding by meaning and no visual difference between a phrase, a voice command and a toggle.
5. **No design system.** One 1237-line stylesheet, a dozen colour tokens, no spacing or type scale,
   system font, hardcoded values (`apps/mobile/src/styles.css:1-29`).
6. **Accessibility gaps for AAC.** No text-size setting, no manual theme, no `prefers-contrast` or
   `forced-colors` rules, reduced motion only on `.app`. Holding a key for 500 ms opens the editor
   (`apps/mobile/src/components/BoardPlayer.tsx:9`), which slow pressers trigger by accident.
7. **Voice picker is a flat list** of every system voice, novelty voices included, in every language.
8. **Deck is thin next to the market.** Only OBS actions exist; there are no computer actions
   (`packages/core/src/domain/actions.ts:15-37`), no folders, no rich live state on keys.

## Scope

In: `packages/core` board model and defaults, `apps/mobile` UI and styles, i18n strings, tests, README.
Out (needs its own decision): computer actions (hotkeys, launch app, media keys), symbol libraries,
word prediction, switch scanning.

## Constraints

- Tests query by role and label, not class. The "Sections" navigation landmark, the link names and
  `aria-current` must be kept or updated together with `apps/mobile/test`.
- Stored boards must migrate without losing user keys.
- The mobile UI must keep working standalone (no desktop server).
- Key positions on existing voice boards must not move (motor memory).

## Tasks

- [x] **T1 Fix the editor collapse.** Route: inline (one stylesheet, no research). Container queries on
      the editor: three panes from 1100px of editor width, board list as a strip above below that,
      single column under 720px. No runnable RED exists for layout in jsdom, so the check is measured
      in the browser: editor keys are 139px wide at a 1024px viewport (were unreadable slivers) and
      111px in three panes at 1440px. Mobile test suite green. Review: RDD is off (global), not run.
- [ ] **T2 Design foundations.** Token layers (colour, spacing, type, radius, elevation, motion), split
      `styles.css` by area, manual theme switch, text-size setting, contrast and reduced-motion rules.
      Check: contrast script for every text/background pair; visual pass in light and dark.
- [ ] **T3 Board kind in the domain.** `Board.kind: "voice" | "deck"`, allowed action categories per
      kind, migration for stored boards (a mixed board is split, never dropped), default voice board
      without caption keys, a default deck board. Test first in `packages/core/test`.
- [ ] **T4 Two spaces in the navigation.** "Voice" (home) and "Deck" as top-level spaces, each listing
      only its own boards; action library and key editor filtered by board kind. Update navigation and
      i18n tests.
- [ ] **T5 Voice space.** Composer always on screen above the phrase grid, colour-coded phrase
      categories, recent phrases, large targets, explicit locked edit mode instead of long-press.
- [ ] **T6 Deck space.** Keys show live state (on air, recording, muted, active scene), connection
      status in the header, empty state that explains how to connect when the computer is missing.
- [ ] **T7 Settings.** Voice picker filtered by language with preview, sections for Voice, Deck and
      Appearance; OBS settings move under Deck.
- [ ] **T8 Dock and docs.** Align the OBS dock with the new tokens, refresh README and screenshots.

## Delivery

Forecast is well above 400 authored changed lines, so this ships as chained PRs, one per task, in the
order above. T1 is independent and can ship first. Chain strategy to be chosen when implementation is
authorized.

## Open decisions

1. Separation model: two spaces in one app (recommended, T3 and T4) or two separate apps/URLs.
2. Whether computer actions are part of this effort or a follow-up feature.

## Evidence sources

- AAC layout research: consistent key location supports motor learning
  (https://pubs.asha.org/doi/10.1044/2018_AJSLP-17-0129).
- Text-based AAC reference: Proloquo4Text keeps typing, saved phrases and history on one screen
  (https://apps.apple.com/app/proloquo4text/id751646884).
- Deck references: Touch Portal, Bitfocus Companion, Macro Deck
  (https://gamerhardware.org/best-stream-deck-alternatives/).
