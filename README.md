# Speak Bot

An assistive text-to-speech tool for people who cannot speak. Type a message or tap a saved phrase, and Speak Bot reads it aloud: on the phone in person, or through the computer for streams and calls.

Runs on **macOS, Windows and Linux**.

## How it fits together

```
 Phone (PWA) ──── local mode ───▶ phone speaker (offline)
      │
      └──── remote mode (Wi-Fi) ──▶ Desktop server ──▶ system voice ──▶ output device
                                        │                              (speakers / virtual mic)
                                        └──▶ /overlay ──▶ OBS Browser Source (captions)
```

| Package         | What it is                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| `packages/core` | Framework-free domain: phrases, ports, use cases, shared protocol types    |
| `apps/mobile`   | Vite + React PWA: local (Web Speech API) and remote (desktop) modes        |
| `apps/desktop`  | Node.js server: system TTS, phrases API, WebSocket events, OBS overlay     |

The core follows a hexagonal layout. `PhraseRepository` and `SpeechSynthesizer` are ports, and each app provides its own adapters.

## Requirements

- Node.js 22 or newer.
- A system voice engine:
  - **macOS**: built in (`say`).
  - **Windows**: built in (System.Speech / Windows voices).
  - **Linux**: `espeak-ng` and `pulseaudio-utils` (works with PipeWire's PulseAudio compatibility). On Debian/Ubuntu: `sudo apt install espeak-ng pulseaudio-utils`.

## Quick start

```sh
npm install
npm start          # builds the mobile app and starts the desktop server on port 4545
```

- **On the computer**, open `http://localhost:4545`.
- **On the phone** (same Wi-Fi), open `http://<computer-ip>:4545`. Under **Speak on**, choose **Computer** to use the phone as a remote deck.
- **Phone only, without the computer**: open the app and choose **This device**. It uses the phone's own voices and works offline once installed. Installing as an app requires HTTPS.

### Desktop options

Use CLI flags (`npm start -w @speak-bot/desktop -- --port 5000`) or environment variables:

| Flag         | Env var              | Default                 |
| ------------ | -------------------- | ----------------------- |
| `--port`     | `SPEAK_BOT_PORT`     | `4545`                  |
| `--host`     | `SPEAK_BOT_HOST`     | `0.0.0.0` (all networks) |
| `--data-dir` | `SPEAK_BOT_DATA_DIR` | see below               |
| `--voice`    | `SPEAK_BOT_VOICE`    | system default          |
| `--device`   | `SPEAK_BOT_DEVICE`   | system default          |
| `--rate`     | `SPEAK_BOT_RATE`     | `1`                     |

Phrases and settings are stored in:

- **macOS**: `~/Library/Application Support/speak-bot`
- **Windows**: `%APPDATA%\speak-bot`
- **Linux**: `$XDG_CONFIG_HOME/speak-bot` (or `~/.config/speak-bot`)

## OBS captions

1. In OBS, add a **Browser** source.
2. URL: `http://localhost:4545/overlay`
3. Set the width and height to your canvas (for example 1920×1080). Leave the background transparent.

Customize it with query parameters:

| Param      | Values                        | Example                      |
| ---------- | ----------------------------- | ---------------------------- |
| `size`     | font size in px               | `size=48`                    |
| `position` | `bottom`, `top`, `center`     | `position=top`               |
| `hold`     | ms the caption stays visible  | `hold=6000`                  |
| `color`    | text color                    | `color=%23ffffff`            |
| `bg`       | caption box background        | `bg=rgba(0,0,0,0.6)`         |

Example: `http://localhost:4545/overlay?size=56&position=bottom&hold=5000`

For the voice itself in OBS, capture the output device you route Speak Bot to (see below), or use desktop audio capture.

## Using the voice as a microphone (calls, Discord, Zoom)

Route Speak Bot to a **virtual audio cable**, then pick that cable as the microphone in the call app. The person's typed words become their voice in the call.

### macOS: BlackHole

```sh
brew install blackhole-2ch
```

So the person also hears the voice, create a **Multi-Output Device**:

1. Open **Audio MIDI Setup**.
2. Click **+** and choose **Create Multi-Output Device**.
3. Check **BlackHole 2ch** and your speakers or headphones.

Then select that device under **Output device** in Speak Bot (Computer mode). In the call app, the microphone is **BlackHole 2ch**.

### Windows: VB-Cable

1. Install [VB-Audio Virtual Cable](https://vb-audio.com/Cable/).
2. Select **CABLE Input** as the output device in Speak Bot.
3. In the call app, the microphone is **CABLE Output**.
4. To also hear it yourself: open **Sound settings → More sound settings → Recording**, open **CABLE Output → Listen**, check **Listen to this device**, and pick your speakers.

If the device selector is not shown on your system, route the app instead: **Settings → System → Sound → Volume mixer**, and set the output of `powershell.exe` to **CABLE Input**.

### Linux: PipeWire / PulseAudio null sink

```sh
pactl load-module module-null-sink sink_name=speakbot sink_properties=device.description=SpeakBot
pactl load-module module-loopback source=speakbot.monitor   # optional: hear it yourself
```

Select **speakbot** as the output device in Speak Bot. In the call app, the microphone is **Monitor of SpeakBot**. These modules reset on reboot; add them to your PipeWire or PulseAudio configuration to make them permanent.

**Tip:** disable noise suppression for that microphone in Discord or Zoom. Some versions cut synthetic voices.

## Security note

The desktop server has **no authentication** and listens on all networks by default, so anyone on the same network can trigger speech. Use it on trusted networks. To restrict it to this computer only, run it with `--host 127.0.0.1`. That disables the phone remote.

## Scripts

| Command             | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `npm start`         | Build the mobile app and start the desktop server |
| `npm run dev -w @speak-bot/mobile` | Mobile dev server (LAN-exposed)    |
| `npm test`          | Run all workspace tests (Vitest)                  |
| `npm run typecheck` | Type-check all workspaces                         |
| `npm run build`     | Build the mobile PWA                              |

CI runs tests, typecheck and build on Linux, macOS and Windows (`.github/workflows/ci.yml`).

## Notes

- Voices come from the operating system, so the available voices and their quality vary by device.
- On iOS (local mode), speech only starts from a direct tap, which is how the app is designed.
