# Speak Bot

An assistive text-to-speech tool for people who cannot speak. Type a message or tap a saved phrase, and the device reads it aloud.

The first deliverable is a **mobile-first PWA** that works on its own, offline, using the device's built-in voices. Later milestones add a desktop app with OBS captions, a virtual-microphone output for calls, and a remote "deck" mode where the phone triggers phrases on the desktop.

## Features (MVP)

- Type text and press **Speak** (Enter speaks, Shift+Enter adds a new line).
- Saved phrases grid: tap to speak, save new ones, delete in edit mode.
- Default phrases on first run (Hello, Thank you, Yes, No, ...).
- Voice and speed settings, remembered on the device.
- Installable and offline-capable (service worker).

## Architecture

```
packages/core     Framework-free domain: Phrase, ports, use cases
apps/mobile       Vite + React PWA: adapters (localStorage, Web Speech API) + UI
```

The core follows a hexagonal layout. `PhraseRepository` and `SpeechSynthesizer` are ports, and each app provides its own adapters. That lets the future desktop app reuse the same domain with different storage, voices, or outputs (OBS, virtual mic, WebSocket).

## Getting started

Requires Node.js 20+.

```sh
npm install
npm run dev -w apps/mobile    # dev server, exposed on your LAN
```

Open the printed `Network` URL on your phone (same Wi-Fi). Note that service workers and installation require HTTPS or `localhost`. For a full install on the phone, serve the build over HTTPS (for example through a tunnel).

## Scripts

| Command             | What it does                       |
| ------------------- | ---------------------------------- |
| `npm test`          | Run all workspace tests (Vitest)   |
| `npm run typecheck` | Type-check all workspaces          |
| `npm run build`     | Build the mobile PWA to `apps/mobile/dist` |

## Notes

- Voices come from the operating system, so the available voices and their quality vary by device.
- On iOS, speech only starts from a direct tap, which is how the app is designed.
