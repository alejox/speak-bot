# Speed Deck

Assistive communication and a stream deck in one app, as two separate spaces. **Voz** (Voice) was made for people who cannot speak: type a message or tap a key, and Speed Deck says it for you, on the phone in person or through the computer in streams and calls. **Deck** controls OBS from the same kind of keys. Caption keys live in **Voz**, next to the voice.

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

#### Updates

The computer app looks for a new version by itself: once shortly after it starts and then every 6 hours. New versions are the [releases published on GitHub](https://github.com/alejox/speak-bot/releases). What happens next depends on the system:

| System            | What the app does with a new version                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Windows           | Downloads it in the background and installs it when you quit the app, or right away with **Reiniciar para actualizar**.    |
| Linux (AppImage)  | The same: downloads it, then replaces the AppImage file when you quit or with **Reiniciar para actualizar**.               |
| macOS             | Only tells you. **Descargar la versión X** opens the release page; download the `.dmg` and install it over the old app.    |
| Linux (`.deb`)    | Only tells you, like macOS. Download the new `.deb` and install it.                                                        |

macOS cannot install updates by itself because the app is not signed with an Apple Developer ID (see above), so each new version is installed by hand, with the same Gatekeeper warning as the first time.

Nothing interrupts you: there are no dialogs. You get one system notification per version (when it is downloaded, or on macOS and `.deb` when it is found), and the state is shown in **Ajustes → Acerca de y actualizaciones** and in the tray menu. If the app cannot reach GitHub it says so there and tries again later.

- **Check by hand**: **Ajustes → Acerca de y actualizaciones → Buscar actualizaciones**, or **Buscar actualizaciones** in the tray menu.
- **Turn automatic checks off**: uncheck **Buscar actualizaciones automáticamente** in the same place. The app then only checks when you ask.
- **What is sent**: to check, the app asks GitHub for the list of releases and the small file that describes the latest one, and on Windows and AppImage it downloads the installer from GitHub. Nothing else is sent: no account, no identifier, nothing about how you use the app. The requests are the same from every installation (the update library's own per-installation id is replaced by a constant). As with any web request, GitHub sees the computer's IP address.
- Only published stable releases are offered, never a preview version or an older one.
- An app run from source (`npm run dev`) never checks for updates.

#### Coming from Speak Bot

Speed Deck was called Speak Bot before. The first time it runs, it copies your phrases and settings from the old `speak-bot` folder and turns your saved phrases into the **Comunicación** board. The old folder is kept as a backup. You can delete the old Speak Bot app.

## Using Speed Deck

The menu is a side menu on wide screens (the button at its top collapses it to icons only) and a tab bar at the bottom on phones. The app opens on **Deck** the first time, then on the section you used last.

| Spanish (default) | English  | What it does                                                            |
| ----------------- | -------- | ----------------------------------------------------------------------- |
| Deck              | Deck     | Your deck boards with OBS keys and their live state                     |
| Voz               | Voice    | Type a message and speak it; recent phrases; voice and caption keys     |
| OBS               | OBS      | The OBS connection (only on the computer itself, not on a paired phone) |
| Conectar          | Connect  | QR code for the phone; OBS caption and dock URLs (computer only)        |
| Ajustes           | Settings | Voice and speed, appearance, language                                   |

- **Each deck board is its own menu item**, named after the board, so switching boards is one click. On the phone there is one **Deck** tab; switch boards with the board selector at the top.
- **The OBS item shows the connection by color and shape**: green with a filled dot when connected, amber with a half dot while connecting, red with an empty ring when not connected.
- Each space keeps its own boards and remembers its own board and page.

Closing the window keeps the app running in the tray or menu bar, so OBS keeps working. Use the tray menu to quit, copy the OBS URLs, or start Speed Deck at login.

### Voz: type or tap to speak

- **Type to speak:** write in the text box and press **Hablar** (or Enter; Shift+Enter adds a line). **Detener** stops the voice.
- **Frases recientes:** the last 8 texts you spoke from the text box appear as a row under it. Tap one to say it again. They are kept on that device only; **Borrar** clears them.
- **Guardar** puts the typed text on the first free key of the current voice board.
- Below, the keys of your voice boards: tap a phrase to say it. Caption keys (**Limpiar subtítulo**, **Subtítulos**) are here too.
- On a wide window, the text box and the recent phrases sit in a panel on the right, next to the keys.

### Boards and keys

- Text you type and speak **waits its turn**: it is said after what is being said, in order (up to 20 waiting). Keys, quick phrases, recent phrases and Repeat cut in at once and empty the queue; Stop empties it too.
- Deck boards have an **Open application** action (macOS): pick one of the computer's applications and the key opens it, or brings it to the front. Only applications the computer lists in `/Applications`, `/System/Applications` or `~/Applications` can be opened; a key never runs anything else.
- Deck boards have an **Input volume** key: a slider for the volume of one OBS audio input that moves like the OBS mixer fader. Choose its height (1–3 rows) and width (1–2 columns) in the key editor; it covers those cells, and no other key can sit on them. Dragging it sets the volume in OBS, and volume changes made in OBS move it.
- Voice boards show four **quick phrases** above the keys (Sí, No, Espera, Gracias; in English Yes, No, Wait, Thanks), in the same place on every page and board. They follow the voice language and are fixed for now.
- A **board** is a grid of keys, 5 × 3 until you change it, with as many pages as you need. The grid button next to the board name sets the size for **all boards of that space**: Voice boards share one size (3–10 columns, 2–8 rows, for a large vocabulary) and Deck boards another (3–8 columns, 2–5 rows). Keys keep their place when they fit; when you shrink the grid, keys that no longer fit move to the next free positions from their own page on, and a size that cannot hold every key is refused. On a phone held upright the board is drawn turned (each row becomes a column, so 6 × 4 shows as 4 columns of 6); positions and pages do not change.
- The keys of a page always fit the screen, on a phone too: they stay square and shrink to fit, so the page never scrolls.
- Every board has a **kind**: a **voice** board holds voice, caption and navigation keys and lives in **Voz**; a **deck** board holds OBS and navigation keys and lives in **Deck**. When you add a key, Speed Deck only offers the actions that fit the board.
- Speed Deck starts with two boards: **Comunicación** (voice: common phrases plus stop, repeat, voice language and the two caption keys) and **Deck** (stream and recording).
- Each **key** has an action and, optionally, a label, an icon and a color. Keys that can be on or off (stream, recording, mute, the current scene, captions) take two colors instead: **Color when off** and **Color when on**; the key shows the second one while it is on, keeping its corner dot.

**Boards from older versions** could mix both kinds of keys. The first time they are loaded, a mixed board is split in two automatically: the voice and caption keys stay on the board, and the OBS keys move to a new board named after it with **(Deck)** added. No key is lost and every key keeps its position.

Caption keys that older versions put on a deck board move to **Comunicación** (or your first voice board) the first time the boards are loaded, keeping their label, icon and colour: in their own position when it is free, otherwise next to the voice keys in the last row, otherwise on the next free position or a new page. If that board already has the same caption key, the copy on the deck board is removed. Without any voice board, **Comunicación** is created with its caption keys.

There is no separate edit mode: a tap always runs a key.

| To…                         | Do this                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Add a key                   | Tap **+** after the last key, pick an action. Actions with details ask for them before saving. |
| Edit or delete a key        | Right-click it, long-press it on a touch screen, or press Shift+F10. Then **Editar** or **Eliminar**. |
| Move a key                  | Drag it onto another place (mouse), hold it and then drag it (touch), or **Editar → Mover a la posición**.                       |
| Add a page                  | Go past the last page with the arrow: it becomes **Página nueva**.                            |
| Create, rename, delete or restore boards | Open the board selector at the top of the space.                                 |

**On a wide window**, the key you edit opens in a panel on the right, with a live preview, the action, the color, the name and **Guardar**. In **Deck** the panel stays open: with no key selected it offers **Agregar tecla**. On the phone, the same editor opens as a dialog.

### Actions

| Category                 | Boards      | Actions                                                                                   |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------- |
| Voz (Voice)              | Voice       | Decir texto, Detener voz, Repetir, Cambiar idioma de la voz                               |
| Subtítulos (Captions)    | Voice       | Limpiar subtítulo, Ocultar o mostrar subtítulos                                           |
| Navegación (Navigation)  | Voice, Deck | Página siguiente, Página anterior, Ir a la página, Abrir tablero, Carpeta                 |
| OBS                      | Deck        | Cambiar de escena, Silenciar o activar audio, Iniciar o detener transmisión, Iniciar o detener grabación, Mostrar u ocultar fuente |
| Sistema (System)         | Deck        | Abrir aplicación, Multiacción                                                             |

- **Navigation** keys move only the device you press them on, so the phone, the computer and the OBS dock can each show a different board or page.
- A **Carpeta** (Folder) key groups keys without spending a whole board: adding one creates an empty folder of the same space and grid size. Inside it, the header shows where you are (for example **Deck › Escenas**) and the first cell is a fixed **Atrás** (Back) key that returns to the page the folder was opened from. Folders can hold folders, up to three levels. They never show in the side menu or the board menu. Deleting a folder key asks first and deletes the folder with every key in it.
- A **Multiacción** (Multi-action) key runs 2–10 actions in order with one press, on the computer. Each step can wait up to 10 seconds before it runs (**Esperar antes**); add, reorder and remove steps in the key editor. A step that fails is reported and the rest still run. While it runs, the key shows **En curso** and pressing it again does nothing. If a step would start recording or streaming, Speed Deck asks once before the whole sequence. Navigation, folders, volume sliders and other multi-actions cannot be steps.
- A key without its own label shows a short name that fits (**Transmitir**, **Grabar**, **Subtítulos**, **Idioma de voz**). Long labels get a smaller font, up to three lines, and never break inside a word.
- Toggle keys show when they are on: a soft tint and a small dot in the corner (red while live or recording), plus the state for screen readers. A muted input shows a crossed microphone, the current scene a tick. The icon at the top of **Deck** shows whether the computer and OBS are connected.
- OBS and caption keys only run through the computer app. When a key can't run right now (no computer, or OBS is not connected), it is shown as unavailable with the reason.

### Settings

**Ajustes** is organized in three groups:

- **Voz**: where to speak and the output device (when the computer app is available), the voice and the speed. The voice list shows the voices of the language Speed Deck speaks; check **Mostrar voces en todos los idiomas** to see every voice, grouped by language. **Probar voz** says a short sentence with the selected voice and speed.
- **Apariencia**: **Tema** (system, light or dark) and **Tamaño del texto** (normal, large or extra large). Both are saved per device.
- **Idioma**: the interface language.
- **Acerca de y actualizaciones** (with the computer app): the version of the computer app and where it is with [updates](#updates). On the computer: **Buscar actualizaciones**, **Reiniciar para actualizar** or **Descargar la versión X**, and **Buscar actualizaciones automáticamente**. A phone connected to the computer sees the computer's version and state, without buttons.
- **Quitar anuncios**: the **Deck** shows a small banner above the keys (never **Voz**). Ads are removed by buying **Quitar anuncios** in the Speed Deck app for Android, on Google Play. A phone that owns it tells the computer it is connected to, and the banner goes away on both at once, and on every other phone connected to that computer. On the computer this section shows the status and the phone that removed the ads; nothing is sold there. A phone's browser without the Android app always shows the banner.

### Phone as a remote

In **Conectar**, scan the QR code with the phone (same Wi-Fi). Then, in **Ajustes → Hablar en**, choose **Computadora**: the keys now run on the computer, with its voice, captions and OBS. The first time, allow incoming network connections when your system asks.

With **Este dispositivo**, the phone works on its own: **Voz** works offline, while OBS and caption keys are shown as unavailable.

## Connect OBS

Speed Deck controls OBS through the WebSocket server built into OBS 28 and newer.

1. In OBS, open **Tools → WebSocket Server Settings**. Check **Enable WebSocket server**. Note the port (default `4455`) and, if authentication is on, the password (**Show Connect Info**).
2. In Speed Deck, open the **OBS** section (**Conexión**). Check **Conectar con OBS** and fill in **Servidor** (`127.0.0.1` when OBS runs on the same computer), **Puerto** and **Contraseña**.
3. Click **Probar conexión**. The status badge, and the color of the **OBS** menu item, show whether OBS is connected.

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
| `typing`   | `0` hides the typing sign     | `typing=0`                   |
| `lang`     | `es`, `en` (typing sign)      | `lang=en`                    |

Example: `http://localhost:4545/overlay?size=56&position=bottom&hold=5000`

While you type something to say with the computer as the speak target, the overlay shows **Escribiendo…** (`lang=en`: **Typing…**) in the caption's place, so the audience knows an answer is coming; the caption replaces it when the text is spoken. Only the fact that you are typing is sent, never the text.

For the voice itself in OBS, capture the output device you route Speed Deck to (see below), or use desktop audio capture.

## OBS dock

Play your boards from inside OBS with a dock. It uses the same boards, voice and output device as the app.

1. Copy the dock URL from **Conectar** (or from the tray menu). It looks like `http://127.0.0.1:4545/dock`.
2. In OBS, open **Docks → Custom Browser Docks** (in older versions, **View → Docks → Custom Browser Docks**).
3. Enter a name (for example `Speed Deck`), paste the URL, and click **Apply**.
4. Dock the panel wherever you like. It has a text box, a board selector (voice and deck boards, grouped) and the keys. Add and edit keys as in the app: **+**, or right-click a key.

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
- **Updates:** checking for updates, restarting to install one and turning automatic checks on or off only work from the computer itself. Phones can only read the computer's version and update state.

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

### Ads and removing them

Every feature is free; the **Deck** shows a small banner above the keys (never in **Voz**). One purchase removes it, in one place: **Quitar anuncios** in the Speed Deck app for Android, sold by Google Play (see [Publishing the Android app](#publishing-to-google-play)). Nothing is sold on the computer.

- **How the computer loses its ads**: when the Android app is connected to a computer and Google Play says the account owns `remove_ads`, the app reports it to that computer (`POST /api/ads/report` with an id of the app installation and the phone's maker and model). The computer saves the grant in `ads-grants.json` in the data folder and is ad-free from then on, also when the phone is off or away, together with every phone connected to it. The app reports again each time it connects and whenever Google Play's answer changes; if it reports that the purchase is no longer owned (a refund), its grant is removed and the banner comes back unless another phone's grant remains. `GET /api/ads` answers `{ "adsFree": true, "grantedBy": { "deviceName": "…", "grantedAt": 1760000000000 } }` or `{ "adsFree": false }`, and changes reach every open client as an `ads-changed` event.
- **Trust**: the computer takes the phone's word; it does not check the purchase with Google. Anyone who can reach the server on your network can send that report, as they can press keys.
- **Sponsor banner**: comes from the published feed (`https://www.alejoxcode.com/speeddeck/banner.json`). To use your own, change `apps/desktop/src/config/monetization.ts` or set `SPEED_DECK_AD_FEED_URL` to an https URL; an empty value leaves only the "Quita los anuncios" house banner.

- **Sponsor feed**: fetched at start and every 6 hours, over https without following redirects. The last good creative is cached in the `ad` folder of the data folder; a failed or invalid fetch keeps it, and `"ad": null` removes it. The feed has one of two shapes. The simple one:

```json
{ "text": "Tutoriales de Speed Deck en YouTube", "url": "https://youtube.com/@alejoxcode", "image": null }
```

`text` (up to 160 characters; it is also the title, shortened to 80) and `url` (https) are required; `image` is an https image URL or `null`. Its id comes from a hash of the three fields, so the banner only counts as new when one of them changes. The full shape:

```json
{
  "ad": {
    "id": "spring-2027",
    "title": "Stream gear",
    "text": "10% off microphones",
    "linkUrl": "https://sponsor.example/offer",
    "imageUrl": "https://cdn.example/banner.png",
    "alt": "A microphone"
  }
}
```

`id` (letters, digits, `.`, `-`, `_`), `title` (up to 80 characters) and `linkUrl` (https) are required; `text` (up to 160), `imageUrl` (https; PNG, JPEG or WebP up to 500 KB) and `alt` are optional. Phones never contact the feed: they get the creative and the image from the computer. No tracking and no cookies.

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

- **Desktop installers**: see [Releasing a version](#releasing-a-version) below. Run `npm run build && npm run pack -w @speed-deck/electron` to build an unpacked app locally; an unpacked app has no update source (electron-builder only embeds it when it builds an installer), so it never checks for updates.
- **Phone app**: every push to `main` deploys the PWA to GitHub Pages (`.github/workflows/pages.yml`).

### Releasing a version

Installed computer apps update from published GitHub Releases, so publishing a version is what delivers it.

1. **Choose the version.** The version is the tag: tag `v1.4.0` publishes Speed Deck `1.4.0`. The `version` fields in the `package.json` files stay at `0.0.0`; the workflow passes the tag's version to the build. Use plain `MAJOR.MINOR.PATCH`, higher than the last release: the apps never install an older version, and they ignore previews such as `v1.4.0-beta.1`.
2. **Tag the commit on `main` and push the tag:**

   ```sh
   git checkout main
   git pull
   git tag v1.4.0
   git push origin v1.4.0
   ```

3. **Wait for the workflow.** `.github/workflows/release.yml` runs the tests and builds on macOS, Windows and Linux, then creates the GitHub Release `v1.4.0` with generated release notes and attaches:
   - the installers: `speed-deck-1.4.0-mac-arm64.dmg`, `speed-deck-1.4.0-mac-x64.dmg`, `speed-deck-1.4.0-win-x64.exe`, and the Linux `.AppImage` and `.deb`;
   - the update metadata the installed apps read: `latest.yml` (Windows), `latest-mac.yml` and `latest-linux.yml`, plus the `.blockmap` files that let Windows download only what changed.

   The release job stops without publishing if an operating system's metadata file is missing or if two jobs produced a file with the same name. It needs no secret besides the `GITHUB_TOKEN` every workflow gets.
4. **Check the release page.** Installed apps find it at their next check (within 6 hours, or at once with **Buscar actualizaciones**). Until the three `latest*.yml` files are attached, a check answers "could not check" and is retried later.

Do not delete or rename the `latest*.yml` files of the newest release, and do not mark it as a pre-release: the apps only look at the latest full release. Running the workflow by hand (**Run workflow**) builds the installers as artifacts without publishing anything.

The update source is `publish` in `apps/electron/electron-builder.yml` (GitHub, `alejox/speak-bot`); electron-builder embeds it in the app as `app-update.yml`. A real update can only be tried with two published releases: install the older one, then publish the newer one.

### Publishing to Google Play

The Android app (`apps/android`, application id `com.alejoxcode.speeddeck`) is free with ads and sells one one-time product, `remove_ads`, through Google Play Billing. It is the only way to remove ads: a phone that owns it also removes them on the computer it connects to (see [Ads and removing them](#ads-and-removing-them)).

1. **Create the upload keystore** (once, on your own computer; keep it and its passwords out of the repository and backed up):

   ```sh
   keytool -genkeypair -v \
     -keystore <path>/speed-deck-upload.jks \
     -alias <key-alias> \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   `keytool` comes with the JDK and asks for the passwords and your name. Use Play App Signing in Play Console, so this key is only the upload key.

2. **Tell the build where the key is**: create `apps/android/keystore.properties` (git-ignored, like `*.jks` and `*.keystore`):

   ```properties
   storeFile=<absolute path, or a path relative to apps/android>/speed-deck-upload.jks
   storePassword=<keystore password>
   keyAlias=<key-alias>
   keyPassword=<key password>
   ```

   Any value missing from the file is read from `SPEED_DECK_UPLOAD_STORE_FILE`, `SPEED_DECK_UPLOAD_STORE_PASSWORD`, `SPEED_DECK_UPLOAD_KEY_ALIAS` and `SPEED_DECK_UPLOAD_KEY_PASSWORD` (for CI). With none of the four set, the bundle is built **unsigned** and Google Play refuses it; with only some set, the build stops and names what is missing.

3. **Set the version** in `apps/android/gradle.properties`: `speedDeck.versionCode` must grow with every upload; `speedDeck.versionName` is what people see.

4. **Build the bundle** (JDK 21 and the Android SDK are needed):

   ```sh
   npm run android:bundle -w @speed-deck/android
   ```

   It builds the web app, bundles it into the app and writes `apps/android/app/build/outputs/bundle/release/app-release.aab`.

5. **Upload before creating the product**: Play Console only lets you create in-app products once a build that contains the Billing library has been uploaded. Upload the `.aab` to a track (internal testing is enough), then create the one-time product with the id `remove_ads` in Play Console's one-time products page (under **Monetize with Play**; menu names change over time) and activate it. Until then the app says purchases are not available.

6. **Add test accounts**: in Play Console's **License testing** settings (Google's name for its purchase testers list), add the Google accounts that will test. Have them install the app from the testing track's Play link; their purchases use Google Play's test payment methods and are not charged. The real purchase can only be tried on a build delivered by Google Play.

The purchase is restored by Google Play itself: the app asks what the Google account owns at start, when it comes back to the screen and on **Restore purchase**, so it follows the account to a reinstall or another phone. The last answer is kept on the phone, so ads stay hidden offline; a refunded purchase brings them back the next time Google Play answers.

## Notes

- Voices come from the operating system, so the available voices and their quality vary by device.
- On iOS (local mode), speech only starts from a direct tap, which is how the app is designed.
