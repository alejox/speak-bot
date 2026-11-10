# Feature: ui-nav-i18n-dock

## Objective
Spanish-first, bilingual UI with section navigation, a dedicated phrase soundboard, and an OBS custom browser dock connected to the same desktop server.

## Problem / Why
User feedback (2026-11-09) after testing the macOS app:
- The UI must be fully in one language: **Spanish by default**, English optional.
- Streamers want to trigger speech from inside OBS: a **dock** that connects to the existing app, so all saved phrases and settings are shared.
- Phrases deserve their own section laid out as a **horizontal button board**, reachable from a **side menu**.

## Design decisions
- **i18n**: lightweight typed dictionaries (`es`, `en`) in `apps/mobile`, no heavy library. Default `es`. Neutral, professional Spanish (tú form).
- **Language preference**: stored per client (localStorage). In Computer mode, also saved to desktop settings so the Electron tray menu follows it.
- **Default seed phrases** follow the language at first run (Spanish set by default). Existing user data is not migrated.
- **Default voice**: when no voice is chosen, prefer one matching the UI language (phone and desktop).
- **Navigation**: side menu with sections *Hablar / Frases / Conectar / Ajustes* (*Speak / Phrases / Connect / Settings*). On narrow screens it collapses into a drawer or bottom bar.
- **Phrase board**: dedicated section with large buttons flowing in horizontal rows (wrapping grid), tap to speak, edit mode to add or delete.
- **OBS dock**: compact view of the same React app at `/dock`, served by the desktop server. Always Computer mode, with a text input and the phrase board, sized for a narrow OBS panel. The OBS dock URL is shown in the Connect section and in the tray menu, with the actual port.

## Tasks
- [ ] T1 — i18n foundation (es/en dictionaries, provider/hook, language setting, Spanish default, localized seeds, language-matched default voice) + translate all existing UI, Electron tray menu and overlay-facing strings. Tests.
- [ ] T2 — Side menu navigation + sections (Speak, Phrases board, Connect, Settings), responsive. Tests.
- [ ] T2b — "Restore default phrases" (user request, 2026-11-09): replaces all phrases with the defaults in the current language, with an inline two-step confirmation. Core use case `restoreDefaultPhrases`, desktop `POST /api/phrases/restore`, local and Computer modes. Tests.
- [ ] T3 — OBS dock view at `/dock` + "Copy dock URL" (Connect section and tray). Tests.
- [ ] T4 — README: OBS dock setup, language.
- [ ] T5 — Stream Deck–style phrase deck (user request, 2026-11-09): fixed grid of square slots (5×3 per page, paged), empty slot shows "+", modal dialog to add, edit or delete a phrase, phrases pinned to slots. Existing phrases get sequential slots. Tests.
- [ ] T6 — Actions deck (user-approved list): Stop, Repeat last phrase, Clear caption, Hide/show captions (overlay), Switch voice language es↔en. Desktop endpoints and WS events; OBS actions disabled in local mode. Also in the dock. Tests.
- [ ] T7 — README update for the deck and actions.

## Constraints
- Code identifiers and comments in English; UI copy through the i18n dictionaries (es default, en).
- Keep the iOS rule: local speak is called synchronously in the tap.
- Container/presentational split; core stays framework-free.
- macOS, Windows and Linux first-class.

## Route declaration
- T1–T3: delegated direct (writer trigger). T4: inline.

## Delivery
- Branch `feat/ui-nav-i18n-dock`, stacked on `feat/desktop-app` (`4e41335`). One more PR (#4) in the chain.
- RDD: off (global).

## Progress / Evidence
- Writer: T1 `1b5513f`, T2 + T2b `c906998`, T3 `90461c8`. RED→GREEN for core, desktop and electron logic. Mobile UI tests were written after the code; regressions were checked by breaking the code on purpose (T1, T3). No RED for the T2 mobile tests.
- T4 inline `4d6d9be` (README sections, language, OBS dock).
- Assess: risk high → independent verifier PASS, 1 low-medium finding (restore not atomic, concurrent restores duplicate the list). Scoped correction, test-first: `d681dfb` atomic `replaceAll`, `95e0b2f` shared localized defaults in core, `20e9635` empty-list copy, `ea972cd` overlay `lang="es"`.
- Parent spot check: `npm test` → 38, 101, 12, 90 passed. Local dmg rebuilt (`apps/electron/release/speak-bot-0.0.0-mac-arm64.dmg`).
- Not verified visually: sidebar and bottom bar, phrase board, dock inside OBS, Spanish tray menu.
- Release note: existing installs become Spanish by default; English phrases with an automatic voice are read by a Spanish voice.
- Deferred nits: the dock reads the language once; the voice cache never refreshes; phrase button accessible name vs label.

## Next step
T1–T3 writer.
