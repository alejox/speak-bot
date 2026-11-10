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

## Next step
T1–T3 writer.
