# Source visibility state on keys

## Objective
A "show/hide source" key (`obs.toggleSourceVisibility`) shows whether its source is visible in OBS, the way OBS
itself does: an open eye while the source is visible, a closed eye (`eye-off`) and the "off" look while hidden.

## Problem
`ObsState` (packages/core/src/ports/obs-controller.ts) carries only scene, muted inputs, streaming and recording.
The desktop only toggles a scene item (`GetSceneItemEnabled` then `SetSceneItemEnabled`) and never reports
visibility, and `presentKey` (apps/mobile/src/app/key-presentation.ts) has no case for the action, so the key
always draws the same open eye.

## Scope
- Core: `ObsState` gains the hidden scene items, keyed by scene and source name.
- Desktop: fill it on connect (scene item lists, which include `sceneItemEnabled`) and keep it live from OBS's
  `SceneItemEnableStateChanged` (plus scene item created/removed/scene list changes as needed); broadcast through the
  existing `obs-state` event.
- Mobile: `presentKey` draws `eye-off`, unpressed, when the source is hidden; visible is pressed with an "on" state;
  unknown state (no OBS) stays as today. Add the action to `ON_STATE_ACTION_TYPES` so the key can offer an on colour.

## Constraints
- Older clients/servers: a missing field means "unknown", never "hidden".
- No new protocol event if `obs-state` can carry it.

## Tasks
- [x] T1 Core + desktop: track source visibility in `ObsState` (route: delegated, 2+ non-trivial files across packages)
- [x] T2 Mobile: present the key's visible/hidden state with eye / eye-off (route: delegated with T1, same writer)

## Acceptance criteria
- Hiding a source in OBS (or with the key) turns the key to a closed eye within the live update; showing it reopens it.
- Tests cover desktop state tracking and the key presentation for visible, hidden and unknown.

## Checks
`npm run typecheck` and `npm test` at the repository root.

## Progress
- Created 2026-11-11. Delivery strategy: ask-on-risk. Forecast: ~250 authored lines.
- 2026-11-11 T1+T2 done in `a8d8f3b` feat(obs): show source visibility on show/hide keys (delegated writer).
  - Core: `ObsState.hiddenSources?: { sceneName, sourceName }[]` (missing = unknown); `isObsState` validates it.
  - Desktop: reads `GetSceneItemList` per scene on connect; follows `SceneItemEnableStateChanged`, `SceneItemCreated`
    (rereads the scene), `SceneItemRemoved`, `SceneCreated`, `SceneRemoved`, `SceneNameChanged`. Unknown when
    `GetSceneList` fails.
  - Mobile: hidden → `{ pressed: false, iconId: "eye-off" }`; visible → `{ pressed: true, state: "on" }`; unknown → `{}`;
    action added to `ON_STATE_ACTION_TYPES`.
  - Test-first: RED observed (desktop 5 failing, mobile 2, core 1), then GREEN.
  - Known limit: a source not placed in the scene at all counts as visible (only hidden items are reported).
  - Checks: `npm run typecheck` exit 0; `npm test` all green (core 221, desktop 266, electron 24, mobile 394).
- Next step: native review assessment for `a8d8f3b` by the parent.
