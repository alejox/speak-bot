# Volume key controls

## Objective
Each OBS volume key (slider) carries its own Mute and Monitor buttons at the bottom, so separate mute/monitor keys are no longer needed.

## Why
User request 2026-11-11: "the volume sliders should have mute and, if possible, monitor at the bottom, so I don't need those extra buttons".

## Design
- Bottom of every volume key (grid and the compact side mixer): two compact toggle buttons, ≥ 44–48px targets, icon + state:
  - Mute: speaker / speaker-off (mic / mic-off for mic inputs); pressed while muted; reuses the existing `toggleMute` OBS action and `mutedInputs` state (the muted slider look stays).
  - Monitor: headphones; pressed while monitoring. OBS monitor types: none / monitor only / monitor and output. Tap toggles between "none" and "monitor and output" (keeps the stream output); the current type comes from OBS.
- Monitor needs new protocol pieces: `ObsState.monitoredInputs` (or a map of monitor types) kept from `GetInputAudioMonitorType` on connect and the `InputAudioMonitorTypeChanged` event, and an action/endpoint calling `SetInputAudioMonitorType`.
- Works on the phone (playing only, no editing needed) and on the computer; disabled with a reason when OBS is not connected or the input does not exist.

## Tasks
- [x] K1 Core + desktop: monitor state tracking and set-monitor action through the OBS adapter (tests with the fake OBS). — `a58f6b4` (delegated writer). `ObsState.monitoredInputs?: string[]` (inputs whose monitor type is not none; optional, so older desktops/clients stay valid), filled on connect from `GetInputAudioMonitorType` per input and kept from `InputAudioMonitorTypeChanged` (Inputs events are in obs-websocket's default subscription). New action `obs.toggleMonitor { inputName }` (icon `headphones`, validated by `parseAction`, run by the action executor): none → monitor and output; monitor only / monitor and output → none. Mobile plumbing in the same commit: `headphones` icon, i18n, monitor key shows on while monitored. RED observed in core (protocol/registry), desktop (fake OBS) and key presentation tests before GREEN.
- [x] K2 Mobile: Mute and Monitor buttons on volume keys and in the compact mixer, i18n, tests. — `a1bbd59` (delegated writer). `VolumeKey` ends with two ≥44px toggles (speaker / mic for mic-icon keys; headphones), `aria-pressed` from `mutedInputs` / `monitoredInputs`, `aria-label` "Mute <input>" / "Monitor <input>" (es: "Silenciar …" / "Monitorizar …"), disabled with the key's reason (`aria-describedby`). They call `onRun` with the OBS action directly, so they work on read-only phone decks. Outlined in the key's text colour, filled when on (icon cut out in the key colour). Compact mixer: fader width 6.25rem with the toggles side by side under the fader; upright, the toggles close the row and the muted word is hidden (the pressed Mute says it). Monitor always shows (off when an older desktop does not report monitoring). RED observed (4 new tests failing) before GREEN.

## Acceptance criteria
- Toggling Mute/Monitor on the key changes OBS and the key reflects changes made in OBS itself.
- typecheck, all tests, mobile + Electron builds pass.

## Status
Done (K1 `a58f6b4`, K2 `a1bbd59`).

Verification at K2: `npm run typecheck` clean; `npm test` core 226, desktop 313, overlay 24, mobile 509 passing; mobile and Electron builds pass.
Screenshots (headless Chrome, fake desktop, Mic muted + Music monitored): scratchpad `volume-k2/k2-b6x3-915x412-dark.png`, `k2-b6x3-412x915-dark.png`, `k2-b6x3-1024x768-dark.png`, `k2-b4x3-*` — no scroll, nothing offscreen.
Still manual: on the real phone and OBS, toggle Mute/Monitor and check OBS Advanced Audio Properties follows, and that changes made in OBS show on the key.
