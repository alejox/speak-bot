# Open an application from a Deck key

## Objective
A Deck action that opens (or brings to the front) an application on the computer, e.g. DaVinci Resolve or Photoshop, chosen from the applications installed there.

## Problem / why
User request (2026-11-11): start the tools of a stream or an edit from the deck instead of looking for them on the computer.

## Tasks
- [x] A1 — `system.openApp` action: core registry and validation, desktop `ApplicationLauncher` port with a macOS adapter and a stub for other systems, `GET /api/applications`, executor, editor select, en/es strings; tests. Route: delegated (one writer; core, desktop and mobile). Core: action `{ type: "system.openApp", appId }` in the new category `system` (Deck boards only), param kind `application`, `MAX_APPLICATION_ID_LENGTH` 1024, default icon `star`; port `ApplicationLauncher` with `ApplicationNotListedError`, `ApplicationsUnsupportedError`, `ApplicationOpenFailedError`, and `applicationNameOf` for the default key label. Desktop: `MacApplicationLauncher` (injected `readDirectory`/`execFile`; `/usr/bin/open -a <path>`), `createApplicationLauncher` (stub elsewhere), executor re-lists and opens only an exact listed id (the adapter checks again), API errors 404 "app-not-found", 409 "apps-unsupported", 502 "app-open-failed". Mobile: `target.listApplications` feeds a select sorted by name (never free text), with hints for an empty or unavailable list; a saved application no longer listed stays selectable under its name; the category shows as "Computer" / "Computadora". RED: core 4, desktop 19, mobile 7 failing; GREEN: `npm run typecheck` exit 0; `npm test` core 168, desktop 200, electron 19, mobile 351, all passing. Manual: on a Mac, the list shows the installed applications and a key opens / focuses DaVinci Resolve and Photoshop (no test starts a real application).

## Security notes
- Keys are edited from phones over the LAN, so the stored value must never become command execution. The action holds one value, the application id, which on macOS is the absolute path of an `.app` bundle found in `/Applications`, `/System/Applications` or `~/Applications` (one level, plus one nested folder level).
- When the key runs, the desktop lists the applications again and opens the id only if it is exactly one of them; anything else is refused with a typed error ("app-not-found"). No arguments, no other paths, no URLs or files.
- The application is opened with `execFile("/usr/bin/open", ["-a", id])`: an argument array, never a shell string.
- Core only checks the shape (non-empty string, at most 1024 characters); the desktop decides what may be opened.

## Known limits
- macOS only. On Windows and Linux the list is empty and running the key fails with "apps-unsupported".
- Keys show a fixed icon; application icons are not shown.

## Acceptance
- On a Deck board, "Open application" offers the computer's applications sorted by name; the key is named after the application and opens it (or focuses it when already running).
- In phone-only mode the key shows "Needs the computer app".
- `npm run typecheck` and `npm test` pass.

## Progress
