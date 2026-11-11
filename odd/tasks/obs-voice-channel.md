# Voice as its own OBS audio channel

## Objective
The spoken voice reaches OBS as an independent audio source (its own mixer channel and track) without virtual audio drivers, on macOS and Windows.

## Approach (decided 2026-11-11)
- The desktop renders each utterance to an audio file (macOS `say -o`, Windows SAPI to WAV, Linux espeak to WAV) and plays it in the OBS overlay Browser Source the desktop already serves.
- In OBS the Browser Source with "Control audio via OBS" shows up as a "Speed Deck" channel in the mixer.
- A desktop setting "Voice output": Speakers (today's behaviour, default) / OBS / Both. Speaking state, queue, stop and captions keep working in every mode.
- If no overlay is connected while output is OBS-only, fall back to the speakers so the person is never silent, and surface that in the status.

## Tasks
- [x] V1 Desktop: render-to-file per platform behind the synthesizer port, serve the clip, broadcast "play clip" to overlays; voice output setting; fallback to speakers when no overlay is connected or none plays the clip. Route: delegated. Commit `1b257b6`.
- [ ] V2 Overlay page: play clips in order, report start/end so speaking state, stop and queue stay correct. Route: delegated. BLOCKED: the page is `apps/desktop/public/overlay.html`, outside the writer's allowed edit surfaces. Implementation and tests are ready as a patch (see Status); not committed.
- [x] V3 Settings UI + OBS setup hint (enable "Control audio via OBS"). Route: delegated. Commit `11bd9c3`.

## Acceptance criteria
- With output OBS, the voice is heard only through the Browser Source channel; with Both, through speakers and OBS; stop cuts both.
- Unit tests for the routing and fallback; typecheck, tests and the Electron build pass.

## Decisions
- Clip format: 16-bit PCM WAV, 22.05 kHz (`say -o … --file-format=WAVE --data-format=LEI16@22050`, System.Speech `SetOutputToWaveFile`, `espeak-ng -w`). `say` defaults to AIFF, which Chromium/OBS CEF does not play.
- Transport: the overlay connects to `/ws?client=overlay`; the desktop sends `voice-clip {id, url}` / `voice-clip-stop {id}` to overlay sockets only, and the overlay reports `clip-started` / `clip-ended` / `clip-failed` on the same socket. The WAV is served at `/api/voice/clips/<32-hex>.wav` (same request guard) only while the clip plays; files live in a per-launch temp folder removed on close, each clip deleted after playback.
- Speaking state: `ProcessSpeechSynthesizer` keeps its queue/cancel logic; a clip utterance is one killable unit (render → overlay play [+ local play]). `onStart` (caption + speaking start) fires when the overlay starts the clip (or at once with "both"); the next queued utterance waits for `clip-ended`. Cancel kills the render or sends `voice-clip-stop`. Safety nets: 5 s start timeout, 5 min max clip, overlay disconnect ends its clips.
- Fallback: with "obs" and no overlay connected, or no overlay starting the clip, the text is spoken on the speakers. `GET /api/voice/status` and the `overlay-audio` event tell clients; the UI warns.
- "both": the same clip plays locally (macOS `afplay`, Linux `paplay --device`, Windows SoundPlayer or WinRT MediaPlayer on the chosen device). afplay cannot pick a device, so on macOS with a chosen device the text is spoken again with `say -a`. In "both", only the local leg can fail the utterance.

## Acceptance evidence
- V1: typecheck pass; tests core 224, desktop 306, electron 24, mobile 435 (all pass); mobile and Electron builds pass. Real checks on macOS: `say` render through the adapter wrote a RIFF/WAVE, 1 ch 22050 Hz Int16 file (afinfo); an isolated desktop (temp home, random port, not 4545) with output "obs" served the rendered clip as `audio/wav` (78,726 bytes, RIFF/WAVE) to a `?client=overlay` socket and emitted speaking start/end following the overlay's reports.
- V2 (patch only): overlay tests 13/13 and desktop 311 pass with the patch applied; reverted because of the edit surface.
- V3: typecheck pass; tests core 224, desktop 306, electron 24, mobile 440 (all pass); mobile and Electron builds pass.
- Not run: Windows and Linux render/play commands (argument building unit-tested only); playback inside real OBS CEF.

## Status
V1 and V3 done. V2 waits for approval to edit `apps/desktop/public/overlay.html` (and `apps/desktop/test/overlay-script.test.ts`, already allowed). Until then the desktop never sees an overlay, so "obs" falls back to the speakers and the settings warn.
