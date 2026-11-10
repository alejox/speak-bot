# Speed Deck

Assistive communication and a stream deck in one app, as two separate spaces. **Voz** (Voice) was made for people who cannot speak: type a message or tap a key, and Speed Deck says it for you, on the phone in person or through the computer in streams and calls. **Deck** controls OBS and its captions from the same kind of keys.

Runs on **macOS, Windows and Linux**. The interface is in **Spanish by default**, with English available.

## Install

### On the phone

1. Open **https://alejox.github.io/speak-bot/** in Safari (iPhone) or Chrome (Android).
2. Add it to the home screen: **Share → Add to Home Screen** on iPhone, or **⋮ → Install app** on Android.
3. Open it from the home screen. It works offline and uses the phone's own voices.

### On the computer

Download the installer for your system from the [latest release](https://github.com/alejox/speak-bot/releases/latest):

| System                | File                                   |
| --------------------- | -------------------------------------- |
| macOS (Apple Silicon) | `speed-deck-<version>-mac-arm64.dmg`   |
| macOS (Intel)         | `speed-deck-<version>-mac-x64.dmg`     |
| Windows               | `speed-deck-<version>-win-x64.exe`     |
| Linux                 | `.AppImage` or `.deb`                  |

#### The installers are not signed yet

Your system will warn you the first time. To open the app anyway:

- **macOS**: double-click the app. When it is blocked, open **System Settings → Privacy & Security** and click **Open Anyway**.
- **Windows**: on the "Windows protected your PC" screen, click **More info → Run anyway**.
- **Linux (AppImage)**: make the file executable (`chmod +x speed-deck-*.AppImage`) and run it. Install `espeak-ng` and `pulseaudio-utils` for the voice. The tray icon on GNOME needs the AppIndicator extension.

#### Coming from Speak Bot

Speed Deck was called Speak Bot before. The first time it runs, it copies your phrases and settings from the old `speak-bot` folder and turns your saved phrases into the **Comunicación** board. The old folder is kept as a backup. You can delete the old Speak Bot app.

## Using Speed Deck

The menu has four sections: a side menu on wide screens (the button at its top collapses it to icons only) and a tab bar at the bottom on phones. The app opens on **Voz**.

| Spanish (default) | English  | What it does                                                         |
| ----------------- | -------- | -------------------------------------------------------------------- |
| Voz               | Voice    | Type a message and speak it; recent phrases; your voice boards       |
| Deck              | Deck     | Your deck boards: OBS and caption keys, with their live state        |
| Conectar          | Connect  | QR code for the phone; OBS caption and dock URLs (computer only)     |
| Ajustes           | Settings | Voice and speed, OBS connection, appearance, language                |

Each space keeps its own boards and remembers its own board and page.

Closing the window keeps the app running in the tray or menu bar, so OBS keeps working. Use the tray menu to quit, copy the OBS URLs, or start Speed Deck at login.

### Voz: type or tap to speak

- **Type to speak:** write in the text box and press **Hablar** (or Enter; Shift+Enter adds a line). **Detener** stops the voice.
- **Frases recientes:** the last 8 texts you spoke from the text box appear as a row under it. Tap one to say it again. They are kept on that device only; **Borrar** clears them.
- **Guardar** puts the typed text on the first free key of the current voice board.
- Below, the keys of your voice boards: tap a phrase to say it.

### Boards and keys

- A **board** is a grid of 5 × 3 keys (3 × 5 on a phone), with as many pages as you need.
- Every board has a **kind**: a **voice** board holds voice and navigation keys and lives in **Voz**; a **deck** board holds OBS, caption and navigation keys and lives in **Deck**. The action library only offers the actions that fit the board.
- Speed Deck starts with two boards: **Comunicación** (voice: common phrases plus stop, repeat and voice language) and **Deck** (captions, stream and recording).
- Each **key** has an action and, optionally, a label, an icon and a color.

**Boards from older versions** could mix both kinds of keys. The first time they are loaded, a mixed board is split in two automatically: the voice keys stay on the board, and the OBS and caption keys move to a new board named after it with **(Deck)** added. No key is lost and every key keeps its position.

Keys are edited in **edit mode** only; a normal tap always runs the key, and there is no long-press or right-click editing.

**On a wide window (the computer):** open **Voz** or **Deck** and click **Editar tablero**. The editor shows the boards of that space, in three panes (stacked when the window is narrower):

1. **Tableros**: create, rename or delete boards, or restore the default board of that space to its original keys.
2. **The key grid**: select a key to edit it below. Drag keys to move or swap them, or use **Mover a la posición**.
3. **Acciones**: the action library, with a search box. Drag an action onto a key, or select a key and click **Asignar**.

In the key editor, set the label, icon, color and the action's details, then click **Guardar**. **Probar** runs the key without saving. **Volver al tablero** closes the editor.

**On the phone:** tap **Editar** next to the board selector, then tap a key or an empty space to open the key editor. Tap **Listo** to leave edit mode.

### Actions

| Category                 | Boards      | Actions                                                                                   |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------- |
| Voz (Voice)              | Voice       | Decir texto, Detener voz, Repetir, Cambiar idioma de la voz                               |
| Subtítulos (Captions)    | Deck        | Limpiar subtítulo, Ocultar o mostrar subtítulos                                           |
| Navegación (Navigation)  | Voice, Deck | Página siguiente, Página anterior, Ir a la página, Abrir tablero                          |
| OBS                      | Deck        | Cambiar de escena, Silenciar o activar audio, Iniciar o detener transmisión, Iniciar o detener grabación, Mostrar u ocultar fuente |

- **Navigation** keys move only the device you press them on, so the phone, the computer and the OBS dock can each show a different board or page.
- **Deck** keys show live state with words or an icon as well as color: an active stream or recording, a muted input, visible captions, the current scene. The top of **Deck** shows whether the computer and OBS are connected.
- Deck keys only run through the computer app. When a key can't run right now (no computer, or OBS is not connected), it is shown as unavailable with the reason.

### Settings

**Ajustes** is organized in four groups:

- **Voz**: where to speak and the output device (when the computer app is available), the voice and the speed. The voice list shows the voices of the language Speed Deck speaks; check **Mostrar voces en todos los idiomas** to see every voice, grouped by language. **Probar voz** says a short sentence with the selected voice and speed.
- **Deck**: the OBS connection (see [Connect OBS](#connect-obs)).
- **Apariencia**: **Tema** (system, light or dark) and **Tamaño del texto** (normal, large or extra large). Both are saved per device.
- **Idioma**: the interface language.

### Phone as a remote

In **Conectar**, scan the QR code with the phone (same Wi-Fi). Then, in **Ajustes → Hablar en**, choose **Computadora**: the keys now run on the computer, with its voice, captions and OBS. The first time, allow incoming network connections when your system asks.

With **Este dispositivo**, the phone works on its own: **Voz** works offline, while the keys in **Deck** are shown as unavailable.

## Connect OBS

Speed Deck controls OBS through the WebSocket server built into OBS 28 and newer.

1. In OBS, open **Tools → WebSocket Server Settings**. Check **Enable WebSocket server**. Note the port (default `4455`) and, if authentication is on, the password (**Show Connect Info**).
2. In Speed Deck, open **Ajustes → Deck → OBS**. Check **Conectar con OBS** and fill in **Servidor** (`127.0.0.1` when OBS runs on the same computer), **Puerto** and **Contraseña**.
3. Click **Probar conexión**. The status badge shows whether OBS is connected.

Speed Deck reconnects on its own when OBS restarts. The OBS settings can only be changed from the computer that runs Speed Deck, not from the phone. The password is stored on that computer and is never sent back to any device.

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

For the voice itself in OBS, capture the output device you route Speed Deck to (see below), or use desktop audio capture.

## OBS dock

Play your boards from inside OBS with a dock. It uses the same boards, voice and output device as the app.

1. Copy the dock URL from **Conectar** (or from the tray menu). It looks like `http://127.0.0.1:4545/dock`.
2. In OBS, open **Docks → Custom Browser Docks** (in older versions, **View → Docks → Custom Browser Docks**).
3. Enter a name (for example `Speed Deck`), paste the URL, and click **Apply**.
4. Dock the panel wherever you like. It has a text box, a board selector (voice and deck boards, grouped) and the keys. **Editar** turns on edit mode, as on the phone.

The Speed Deck app must be running. If it starts on a different port (because 4545 was busy), copy the new URL and update the dock.

## Using the voice as a microphone (calls, Discord, Zoom)

Route Speed Deck to a **virtual audio cable**, then pick that cable as the microphone in the call app. The person's typed words become their voice in the call.

### macOS: BlackHole

```sh
brew install blackhole-2ch
```

So the person also hears the voice, create a **Multi-Output Device**:

1. Open **Audio MIDI Setup**.
2. Click **+** and choose **Create Multi-Output Device**.
3. Check **BlackHole 2ch** and your speakers or headphones.

Then select that device as the output device in **Ajustes → Voz** (Computer mode). In the call app, the microphone is **BlackHole 2ch**.

### Windows: VB-Cable

1. Install [VB-Audio Virtual Cable](https://vb-audio.com/Cable/).
2. Select **CABLE Input** as the output device in Speed Deck.
3. In the call app, the microphone is **CABLE Output**.
4. To also hear it yourself: open **Sound settings → More sound settings → Recording**, open **CABLE Output → Listen**, check **Listen to this device**, and pick your speakers.

If the device selector is not shown on your system, route the app instead: **Settings → System → Sound → Volume mixer**, and set the output of `powershell.exe` to **CABLE Input**.

### Linux: PipeWire / PulseAudio null sink

```sh
pactl load-module module-null-sink sink_name=speeddeck sink_properties=device.description=SpeedDeck
pactl load-module module-loopback source=speeddeck.monitor   # optional: hear it yourself
```

Select **speeddeck** as the output device in Speed Deck. In the call app, the microphone is **Monitor of SpeedDeck**. These modules reset on reboot; add them to your PipeWire or PulseAudio configuration to make them permanent.

**Tip:** disable noise suppression for that microphone in Discord or Zoom. Some versions cut synthetic voices.

## Security note

The desktop server has **no authentication** and listens on all networks by default, so anyone on the same network can press keys and trigger speech. Use it on trusted networks. To restrict it to this computer only, run it with `--host 127.0.0.1`. That disables the phone remote.

- **Other websites:** to stop other websites open in your browser from reading captions or pressing keys, the server only accepts requests addressed to `localhost`, an IP address, or this computer's name (`<hostname>` / `<hostname>.local`). If you reach it through a custom DNS name, add that name with `--allowed-host`.
- **OBS settings:** the OBS connection settings and the connection test only work from the computer itself.

## How it fits together

```
 Phone (PWA) ──── local mode ───▶ phone speaker (offline)
      │
      └──── remote mode (Wi-Fi) ──▶ Desktop server ──▶ system voice ──▶ output device
                                        │                              (speakers / virtual mic)
                                        ├──▶ /overlay ──▶ OBS Browser Source (captions)
                                        ├──▶ /dock ─────▶ OBS Custom Browser Dock
                                        └──▶ obs-websocket ──▶ OBS (scenes, audio, stream, recording)
```

| Package         | What it is                                                                         |
| --------------- | ---------------------------------------------------------------------------------- |
| `packages/core` | Framework-free domain: boards, keys, actions and their registry, ports, use cases, protocol types |
| `apps/mobile`   | Vite + React PWA: the Voice and Deck spaces, board editor, OBS dock, local (Web Speech API) and remote modes |
| `apps/desktop`  | Node.js server: system TTS, boards API, action executor, OBS connection, WebSocket events, overlay |
| `apps/electron` | Desktop app shell: runs the server, window, tray, phone pairing                    |

The core follows a hexagonal layout. `BoardRepository`, `SpeechSynthesizer` and the OBS controller are ports, and each app provides its own adapters.

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
npm start                            # builds the mobile app and starts the desktop server on port 4545
npm run dev -w @speed-deck/electron  # or run the desktop app shell
```

If port 4545 is busy, the server uses the next free port and says so in the output.

- **On the computer**, open `http://localhost:4545`.
- **On the phone** (same Wi-Fi), open `http://<computer-ip>:4545`. In **Ajustes → Hablar en**, choose **Computadora** to use the phone as a remote deck.
- **Phone only, without the computer**: choose **Este dispositivo**. Installing as an app requires HTTPS.

### Desktop options

Use CLI flags (`npm start -w @speed-deck/desktop -- --port 5000`) or environment variables. The old `SPEAK_BOT_*` names still work.

| Flag             | Env var                    | Default                                  |
| ---------------- | -------------------------- | ---------------------------------------- |
| `--port`         | `SPEED_DECK_PORT`          | `4545`                                   |
| `--host`         | `SPEED_DECK_HOST`          | `0.0.0.0` (all networks)                 |
| `--data-dir`     | `SPEED_DECK_DATA_DIR`      | see below                                |
| `--voice`        | `SPEED_DECK_VOICE`         | automatic (matches the language)         |
| `--device`       | `SPEED_DECK_DEVICE`        | system default                           |
| `--rate`         | `SPEED_DECK_RATE`          | `1`                                      |
| `--allowed-host` | `SPEED_DECK_ALLOWED_HOSTS` | none (comma-separated extra host names)  |

Boards and settings are stored in:

- **macOS**: `~/Library/Application Support/speed-deck`
- **Windows**: `%APPDATA%\speed-deck`
- **Linux**: `$XDG_CONFIG_HOME/speed-deck` (or `~/.config/speed-deck`)

### Scripts

| Command                              | What it does                                      |
| ------------------------------------ | ------------------------------------------------- |
| `npm start`                          | Build the mobile app and start the desktop server |
| `npm run dev -w @speed-deck/mobile`  | Mobile dev server (LAN-exposed)                   |
| `npm test`                           | Run all workspace tests (Vitest)                  |
| `npm run typecheck`                  | Type-check all workspaces                         |
| `npm run build`                      | Build the mobile PWA and the desktop app bundle   |

CI runs tests, typecheck and build on Linux, macOS and Windows (`.github/workflows/ci.yml`).

### Releasing

- **Desktop installers**: push a version tag (`git tag v0.1.0 && git push origin v0.1.0`). `.github/workflows/release.yml` builds the installers on all three systems and attaches them to a GitHub Release. Run `npm run build && npm run pack -w @speed-deck/electron` to build an unpacked app locally.
- **Phone app**: every push to `main` deploys the PWA to GitHub Pages (`.github/workflows/pages.yml`).

## Notes

- Voices come from the operating system, so the available voices and their quality vary by device.
- On iOS (local mode), speech only starts from a direct tap, which is how the app is designed.
