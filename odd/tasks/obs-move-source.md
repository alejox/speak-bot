# OBS action: move source

Status: IMPLEMENTED, not seen in a real OBS (authorized by the owner 2026-11-24). Branch `feat/obs-move-source` from `main` (v0.2.1).

## Objective
A Deck key moves an OBS source to a place the owner defined, for example the camera to a corner with one key and to full screen with another.

## Problem / why
The only thing a key can do with a source is show or hide it (`obs.toggleSourceVisibility`). The owner looked for a way to move a source in the action list and there is none. Today the owner positions the camera in OBS with a mask plugin ("AC Mask" in the owner's words; not identified with certainty, probably a filter on the source).

## Decisions
- Owner (2026-11-24): add "Move source"; a key takes one source to a fixed place.
- Parent: the place is captured from OBS ("use the source's current position") instead of typed blind, and stays editable as numbers; the move can be instant or animated over a short time; it works as a step of a multi-action.

## Tasks
- [x] M1 `obs.moveSource` action end to end: core action and validation, OBS adapter, server execution and capture endpoint, key editor fields, multi-action step, i18n, README. Route: delegated writer (multi-package).

## Open risk
How a moved scene item interacts with the owner's mask plugin is unknown: a filter on the source should travel with it, but this was not seen in the owner's OBS.

## Checks
`npm run typecheck`, `npm test`, `npm run build`. A real OBS is needed to see the move; tests use the fake OBS client.

## Evidence (2026-11-24)
- Action `obs.moveSource { sceneName, sourceName, transform, durationMs 0..2000 }`; transform stores position, scale X/Y, rotation, crop and, when used, bounds type and size. Not stored: alignment, bounds alignment, crop-to-bounds.
- OBS requests `GetSceneItemId`, `GetSceneItemTransform`, `SetSceneItemTransform`: request names confirmed in the installed obs-websocket-js 5.0.8 types; the transform's inner field names taken from the obs-websocket source (`Obs_ObjectHelper.cpp`, `RequestHandler_SceneItems.cpp`), since the protocol document treats it as opaque.
- Capture endpoint `GET /api/obs/scenes/:name/items/:source/transform`; animation at 30 frames per second with cubic ease-in-out, planned by the pure `planSourceMove`; a second press on the same item cancels the running move.
- RED then GREEN: core 12 failing, desktop 17, mobile 14. Parent re-run: typecheck clean; core 277, desktop 373, electron 87, mobile 675 passing. Writer ran `npm run build`.
- No group support, same as show/hide source.
- NOT verified: anything against a real OBS (the combined transform update, smoothness at 30/s, bounds animation, behaviour with a mask plugin or filters), and the editor's layout in a browser.
