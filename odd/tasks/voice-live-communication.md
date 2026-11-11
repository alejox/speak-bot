# Voice: live communication

## Objective
Make the Voice module work better for people who cannot speak, on a stream and in daily life: the audience sees that an answer is being typed, the commonest answers are always in the same place, and typed sentences are said one after another instead of cutting each other off.

## Problem / why
User-approved tasks (2026-11-11). While the person types, the audience sees silence. Short answers ("yes", "no") move with the page and the board. A sentence typed while another is still being said cuts it off.

## Tasks
- [x] V1 — "Typing…" indicator on the stream overlay. Route: delegated (one writer; core protocol, desktop API and overlay, mobile composer). Clients only listen on the WebSocket (`EventHub` ignores incoming messages), so the flag goes over HTTP: `PUT /api/composing {composing}` → `composing` event (boolean only), broadcast on changes, expiring on the desktop after `COMPOSING_TIMEOUT_MS` (10 s) without a refresh and turned off when an utterance starts. Mobile: `useComposingSignal` inside `Composer`, fed by `target.reportComposing` (null unless the computer speaks, so phone-only sends nothing): on when the text becomes non-empty, off when it is emptied (also by the clear button), spoken, the composer unmounts or after 8 s idle. Interpretation: "state changes only" would let the desktop expire the flag after 10 s of continuous typing, so while keystrokes go on the client also re-sends `true` at most every 5 s. Overlay: `#typing` ("Escribiendo" / "Typing" plus three animated dots) shares the caption's place and style, shows only while composing, captions are on and no caption shows; `typing=0` hides it; no overlay language mechanism existed, so `lang` (default es) picks the text. RED: desktop 9 failing (API 3, executor expiry 3, overlay script 3), mobile `composing-signal.test.tsx` failing to load; GREEN: core 156, desktop 170, mobile 328. Manual: the look of the sign and its dots in a real OBS Browser Source.
- [x] V2 — Quick phrases strip (Yes / No / Wait / Thanks), always in the same place above the keys of every Voice board and page. Route: delegated (same writer). `QUICK_PHRASES_BY_LANGUAGE` in core (es: Sí, No, Espera, Gracias; en: Yes, No, Wait, Thanks), picked by the voice language (`target.voiceLanguage ?? language`). `QuickPhrases` renders through the new `strip` prop of `BoardPlayer`, a row between the header and the grid (grid area `strip` in the space layout), outside the `ol`, so it takes no slot and is neither paged nor transposed. A tap runs `{ type: "voice.speak", text }` through the same runner as a key press (`confirmed.run`): the computer when it speaks, else this device; like keys, it is not added to the recent phrases. Four equal columns on one row, `min-height: --size-control` (≥ 44px), ellipsis instead of wrapping. Also shown in the dock on Voice boards (same prop). Not shown on Deck boards. RED: new `apps/mobile/test/quick-phrases.test.tsx` 7/7 failing; GREEN: mobile 335, core 156. Manual: one row of four ≥ 44px buttons and no scroll on 390×844, 844×390, 768×1024, 1280×800.
- [x] V3 — Queue mode for typed text; keys, quick phrases, recent phrases and repeat keep interrupting; Stop clears the queue. Route: delegated (same writer). Core: `SpeakMode` (`"queue" | "interrupt"`, default interrupt) on `SpeakOptions`, `MAX_SPEECH_QUEUE` = 20 waiting utterances, `SpeechQueueFullError`; `SpeakRequest.mode` and `ApiErrorCode` "queue-full" in the protocol. Desktop: `ProcessSpeechSynthesizer` keeps the queue (an interrupting utterance or `cancel` kills the current one and drops those waiting; `onStart` fires when an utterance really starts); the executor broadcasts caption and `speaking` from `onStart`, ends the previous utterance before the next one starts so events stay ordered, sets the repeat text at start, and refuses a queued request with 409 "queue-full" when 20 already wait; `POST /api/speak` validates `mode`. Mobile: `WebSpeechSynthesizer` uses the browser's own queue for queued utterances (same bound, settles dropped ones itself); `RemoteSpeechSynthesizer` sends `mode` and, since the events do not name an utterance, settles everything asked so far on an "end"; `useSpeech.speak(text, mode)`; the composer (app and dock) speaks with "queue", everything else interrupts; a full queue shows "Too many phrases are waiting…" in the status line. RED: core 1, desktop 8 (synthesizer 4, API 4), mobile 7 failing; GREEN: core 158, desktop 178, mobile 343. Manual: with a real voice, three typed sentences are said in order and a key cuts in, on the phone (iOS Safari, Android Chrome) and through the computer.

## Constraints
- The text being typed never leaves the device before it is spoken: `composing` carries a boolean only.
- Phone-only mode (no computer) sends nothing.
- The grid must still fit without scrolling with the strip in place.

## Acceptance
- With the computer as speak target, typing in the composer shows "Escribiendo…" / "Typing…" on the overlay until the text is spoken, emptied or left alone; a caption replaces it; `typing=0` hides it.
- Four quick phrases sit above the keys of every Voice board and page and speak at one tap.
- Typed sentences are spoken in order; a key, a quick phrase, a recent phrase or repeat interrupts and empties the queue; Stop empties it.
- `npm run typecheck` and `npm test` pass.

## Known limits
- The four quick phrases are fixed in this version (not editable).

## Progress
- V1 b2fe428, V2 649b049, V3 7ef9a1d.
- Final checks after V3 and A1 (2026-11-11): `npm run typecheck` exit 0; `npm test` core 168, desktop 200, electron 19, mobile 351, all passing.
- Pending manual checks: the typing sign in a real OBS Browser Source; the strip's size and the no-scroll fit on real screens; queue order and interruption with real voices on the phone and through the computer.
