# Premium UX redesign: separate Voice from Deck

Status: IN PROGRESS. Authorized 2026-11-10: the user chose two spaces inside one app.
Branch: `feat/premium-ux-redesign`, stacked on `feat/stream-deck-boards` like the existing PR chain.
Order changed after authorization: T1, T3, T4, then T2 and T5 to T8, because separating the two
experiences is the user's main request and the visual work builds on that structure.
T1 commit: d02e459. Next step: close T3 (verifier), then T4.

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
- [x] **T2 Design foundations.** Route: delegated writer. Token layers in `apps/mobile/src/styles/`
      (nine files behind the `styles.css` entry), light and dark themes, blue accent for Voice and
      violet for Deck via `data-space`, Appearance settings (theme, text size) stored per device,
      `prefers-contrast`, `forced-colors` and app-wide reduced motion. Evidence: RED 7 failing then 188
      mobile tests passing; build ok; computed contrast AA or better for every pair listed by the
      writer (lowest text pair 4.93:1, UI boundaries 3.2:1 or more); parent re-ran tests and typecheck
      and viewed Voice in both themes. Not checked: OBS dock, Connect panel, phone key dialog, forced
      colours. Left as is: PWA manifest colours in `vite.config.ts`.
- [x] **T3 Board kind in the domain.** Route: delegated writer (core, desktop and mobile files).
      `Board.kind: "voice" | "deck"`; voice allows voice + navigation, deck allows obs + captions +
      navigation; lazy migration in `readStoredBoards` splits a mixed board into `<id>` (voice) and
      `<id>-deck`, slots unchanged; default voice board without caption keys plus a default deck board.
      Evidence so far: core RED 18 failing then GREEN; parent re-run 2026-11-10: typecheck clean,
      core 123, desktop 156, mobile 150 tests passing; in the browser an existing stored board split
      into "Comunicación" and "Comunicación (Deck)" with no console errors. `gentle-ai review assess`
      was unassessable (untracked files), treated as high: independent verifier returned "pass with
      follow-ups" (3000-case fuzz: no key lost, no slot moved, idempotent; 50 mixed boards accepted by
      the desktop write guard). Follow-ups carried into T4: a board that already has a kind drops
      disallowed keys instead of splitting them out; name/id truncation can cut a surrogate pair.
      Known limit, accepted: a user with more than 25 mixed legacy boards ends above the 50-board
      limit and must delete boards before creating new ones (no data loss).
- [x] **T4 Two spaces in the navigation.** Route: delegated writer. Sections are now Voice (home,
      composer above the voice boards), Deck, Connect and Settings; each space lists, edits, creates
      and restores only boards of its kind and remembers its own board and page. The Speak section and
      QuickKeys are gone. Also closes the T3 follow-ups: a kinded board with refused keys is split
      (`<id>-deck` or `<id>-voice`) instead of losing them, and truncation is surrogate-safe.
      Evidence: core RED 4 then 128 passing; mobile RED 40 then 169 passing; parent re-run of
      typecheck, core and mobile suites green; Voice and Deck screens checked in the browser
      (standalone, Spanish). Not checked: with the computer app connected, the OBS dock optgroups.
      Commits: T3 13c8a69; T4 recorded in git log (`fix(core)` split hardening, `feat(mobile)` spaces).
- [x] **T5 Voice space.** Route: delegated writer (with T6). Text-first keys (no default speech
      bubble), three key roles (phrase, command, navigation), compact auto-growing composer, recent
      phrases row (last 8, per device, clearable), long-press and right-click editing removed in favour
      of explicit edit mode. Changed from the plan: role styling instead of colour-coded categories,
      because keys have no category field yet.
- [x] **T6 Deck space.** Live state on keys (LIVE, recording, muted, captions on, active scene) with a
      text or icon cue besides colour, status pills in the header, offline look for unavailable keys.
      Accepted writer calls: captions `aria-pressed` now means visible; the OBS dock gained an
      Edit/Done button because long-press was its only way to edit.
      Evidence T5+T6: RED 20 failing then 218 mobile tests passing; build ok; parent re-ran tests and
      typecheck and viewed Voice and Deck in light theme at about 1024px. Writer measured at 375x667:
      first key row ends at 536px with the tab bar at 596px when there are no recent phrases.
      Known gaps: with recent phrases present the first key row is clipped by 9px at 375x667 (carried
      into T7); nothing that needs the computer app or OBS was seen in a browser (live states,
      connected pills, dock); the speaking highlight can stick to the wrong key if a remote key request
      fails and the next speech comes from the composer.
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
