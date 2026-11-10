# Speak Bot

An assistive text-to-speech tool for people who cannot speak. Type a message or tap a saved phrase, and Speak Bot reads it aloud: on the phone in person, or through the computer for streams and calls.

Runs on **macOS, Windows and Linux**.

## Install

### On the phone

1. Open **https://alejox.github.io/speak-bot/** in Safari (iPhone) or Chrome (Android).
2. Add it to the home screen: **Share → Add to Home Screen** on iPhone, or **⋮ → Install app** on Android.
3. Open it from the home screen. It works offline and uses the phone's own voices.

### On the computer

Download the installer for your system from the [latest release](https://github.com/alejox/speak-bot/releases/latest):

| System                | File                                  |
| --------------------- | ------------------------------------- |
| macOS (Apple Silicon) | `speak-bot-<version>-mac-arm64.dmg`   |
| macOS (Intel)         | `speak-bot-<version>-mac-x64.dmg`     |
| Windows               | `speak-bot-<version>-win-x64.exe`     |
| Linux                 | `.AppImage` or `.deb`                 |

Open **Speak Bot**. Use the side menu to switch between sections:

| Spanish (default) | English  | What it does                                               |
| ----------------- | -------- | ---------------------------------------------------------- |
| Hablar            | Speak    | Type a message and speak it; quick access to phrases       |
| Frases            | Phrases  | Button board of saved phrases; add, delete or restore defaults |
| Conectar          | Connect  | QR code for the phone, OBS caption and dock URLs           |
| Ajustes           | Settings | Language, voice, speed, output device                      |

The interface is in **Spanish by default**. Switch to English under **Ajustes → Idioma**.

Closing the window keeps the app running in the tray or menu bar, so OBS keeps working. Use the tray menu to quit, copy the OBS URLs, or start Speak Bot at login.

**Connect the phone:** in **Conectar**, scan the QR code with the phone (same Wi-Fi). Then, under **Hablar en**, choose **Computadora**. The first time, allow incoming network connections when your system asks.

**Restore default phrases:** in **Frases**, enter edit mode and choose **Restaurar frases predeterminadas**. This replaces all saved phrases with the defaults in the current language, after a confirmation.

#### The installers are not signed yet

Your system will warn you the first time. To open the app anyway:

- **macOS**: double-click the app. When it is blocked, open **System Settings → Privacy & Security** and click **Open Anyway**.
- **Windows**: on the "Windows protected your PC" screen, click **More info → Run anyway**.
- **Linux (AppImage)**: make the file executable (`chmod +x speak-bot-*.AppImage`) and run it. Install `espeak-ng` and `pulseaudio-utils` for the voice. The tray icon on GNOME needs the AppIndicator extension.

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
| `apps/electron` | Desktop app shell: runs the server, window, tray, phone pairing            |

The core follows a hexagonal layout. `PhraseRepository` and `SpeechSynthesizer` are ports, and each app provides its own adapters.

## Development

### Requirements

- Node.js 22 or newer.
- A system voice engine:
  - **macOS**: built in (`say`).
  - **Windows**: built in (System.Speech / Windows voices).
  - **Linux**: `espeak-ng` and `pulseaudio-utils` (works with PipeWire's PulseAudio compatibility). On Debian/Ubuntu: `sudo apt install espeak-ng pulseaudio-utils`.

### Run from source

```sh
npm install
npm start                          # builds the mobile app and starts the desktop server on port 4545
npm run dev -w @speak-bot/electron # or run the desktop app shell
```

If port 4545 is busy, the server uses the next free port and says so in the output.

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
| `--allowed-host` | `SPEAK_BOT_ALLOWED_HOSTS` | none (comma-separated extra host names) |

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

## OBS dock

Control Speak Bot from inside OBS with a dock. It uses the same phrases, voice and output device as the app.

1. Copy the dock URL from **Conectar** (or from the tray menu). It looks like `http://127.0.0.1:4545/dock`.
2. In OBS, open **Docks → Custom Browser Docks** (in older versions, **View → Docks → Custom Browser Docks**).
3. Enter a name (for example `Speak Bot`), paste the URL, and click **Apply**.
4. Dock the panel wherever you like. It has a text box, Speak and Stop buttons, and the phrase board.

The Speak Bot app must be running. If it starts on a different port (because 4545 was busy), copy the new URL and update the dock.

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

To block other websites open in your browser from reading captions or triggering speech, the server only accepts requests addressed to `localhost`, an IP address, or this computer's name (`<hostname>` / `<hostname>.local`). If you reach it through a custom DNS name, add that name with `--allowed-host`.

## Scripts

| Command             | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `npm start`         | Build the mobile app and start the desktop server |
| `npm run dev -w @speak-bot/mobile` | Mobile dev server (LAN-exposed)    |
| `npm test`          | Run all workspace tests (Vitest)                  |
| `npm run typecheck` | Type-check all workspaces                         |
| `npm run build`     | Build the mobile PWA                              |

CI runs tests, typecheck and build on Linux, macOS and Windows (`.github/workflows/ci.yml`).

### Releasing

- **Desktop installers**: push a version tag (`git tag v0.1.0 && git push origin v0.1.0`). `.github/workflows/release.yml` builds the installers on all three systems and attaches them to a GitHub Release. Run `npm run pack -w @speak-bot/electron` to build an unpacked app locally.
- **Phone app**: every push to `main` deploys the PWA to GitHub Pages (`.github/workflows/pages.yml`).

## Notes

- Voices come from the operating system, so the available voices and their quality vary by device.
- On iOS (local mode), speech only starts from a direct tap, which is how the app is designed.
