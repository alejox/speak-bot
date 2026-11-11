# Ads banner and "remove ads" license

## Objective
Every feature stays free with an ad banner on Deck screens; a one-time USD 12 purchase (Lemon Squeezy license key) removes the banner on the computer and on every paired phone.

## Why
User decisions 2026-11-11: everything free with ads; pay once (USD 12) to remove them; the ad is a horizontal banner at the top of the Deck area, never a grid cell, never in Voice. Research 2026-11-11: AdSense forbids ads in software and in frames the publisher controls (support.google.com/adsense/answer/48182, /3394713); AdMob needs the native SDK; Carbon/EthicalAds are website-only. So the banner is self-managed (house + sponsor feed). Lemon Squeezy: merchant of record, 5% + 50¢, native license keys, keyless activate/validate API (docs.lemonsqueezy.com/api/license-api).

## Design
- Config (placeholders until the user creates the store and a public feed): `apps/desktop/src/config/monetization.ts` — Lemon Squeezy store id, product id, checkout URL, ad feed URL; each overridable by an env var. Missing values disable the matching feature gracefully (no feed → house banner; no checkout URL → buy button hidden).
- License (desktop only): `LicenseService` port + Lemon Squeezy adapter. Activate with `POST https://api.lemonsqueezy.com/v1/licenses/activate` (`license_key`, `instance_name` = computer name), accept only when the response is activated and its `meta.store_id`/`meta.product_id` match the config. Store key, instance id, status and last validation date in `dataDir/license.json`. Validate at startup and every 24 h; network errors keep the stored status (offline grace); an explicit invalid/expired/disabled answer turns ads back on. "Remove license" deactivates the instance and deletes the file.
- API: `GET /api/license` → `{adsFree, maskedKey?, lastValidatedAt?}`; `PUT /api/license {key}` activate; `DELETE /api/license`. Broadcast `license-changed`. Errors: invalid key, wrong product, activation limit reached, network unavailable.
- Ad feed (desktop only): fetch the JSON feed (https only) every 6 h, validate `{id, title, text?, linkUrl (https), imageUrl? (https), alt?}`, download the image (png/jpeg/webp, ≤ 500 KB) into `dataDir/ad/`, cache the last good creative. Serve `GET /api/ad` (creative without remote URLs except `linkUrl`) and `GET /api/ad/image`. No feed or failure with no cache → no sponsor (house banner).
- Banner (mobile UI, used by Electron too): a fixed-height strip between the board header row and the key grid on Deck boards only (main app; the dock is a known limit unless trivial). Small "Ad" / "Anuncio" label. Sponsor creative opens `linkUrl` outside the app (Electron: system browser via `shell.openExternal`, https only; phone: new tab with `rel="noopener noreferrer"`). House creative: "Remove ads for USD 12" / "Quita los anuncios por USD 12" that opens Settings → Remove ads. Hidden when `adsFree`. The grid still fits without scroll.
- Settings → "Remove ads" / "Quitar anuncios": status, Buy button (checkout URL in the system browser), key field + Activate, Remove license; on paired phones the section only shows the status and says activation happens on the computer. Phone-only mode: house banner always, with a note that removing ads needs the computer app (known limit).
- No tracking, no third-party cookies, no personal data sent anywhere except the license key and computer name to Lemon Squeezy at activation/validation.
- Fix the horizontal scrollbar visible at the bottom of the Deck main area (user screenshot 2026-11-11, with 2-column volume sliders).

## Tasks
- [x] L1 — Core + desktop: license port, Lemon Squeezy adapter, file store, periodic validation, `/api/license`, `license-changed`; tests. Route: delegated. Commit `b3d2836`. RED: 4 new desktop test files failed on missing modules; GREEN: desktop 31 files / 250 tests (after L2), typecheck clean.
- [x] L2 — Desktop: ad feed fetcher/cache, `/api/ad`, `/api/ad/image`; Electron external-link handling; README config/feed docs; tests. Route: delegated. Commit `f8983a8`. RED: ad-feed, ad-api and external-links tests failed on missing modules; GREEN: desktop 250 tests, electron 24 tests.
- [x] L3 — Mobile: banner, Settings section, phone inheritance, phone-only limit, scrollbar fix; en/es strings; tests. Route: delegated. Commit `6856395`. RED: 10/10 new RTL tests failed, CSS regression test failed without the fix; GREEN: mobile 47 files / 384 tests.
- [x] L4 — Desktop (user request 2026-11-11): the feed parser accepts both `{ "ad": Creative | null }` and the flat `{ "text", "url", "image" }` (text → title, shortened to 80, and text; url → linkUrl; image → imageUrl or none; id `feed-<sha256 of the three fields>`), same https/size/cache rules. Built-in defaults: feed `https://www.alejoxcode.com/speeddeck/banner.json`, Lemon Squeezy store `520786`, product `1517249`, checkout `https://speeddeck.lemonsqueezy.com/checkout/buy/a38c9fa0-39f6-43c4-97a5-dc82c8635b90` (public values; no license key), so Buy and activation work out of the box against that store; env vars still override and an empty one turns the feature off. `start-desktop` tests now pass empty env vars so they never reach the network. README updated. Route: delegated. Commit `L4_HASH`. RED: 3 new tests failed (flat feed mapping, flat image + id change, built-in defaults); GREEN: desktop 33 files / 262 tests; `npm run typecheck` clean, `npm test` all workspaces green (core 221, electron 24, mobile 392). Pending manual check: the computer's Settings → Remove ads shows Comprar and the key field against the live store, and the live feed banner renders.

## Acceptance
- Without a license the Deck shows the banner (house creative when there is no feed); Voice never does.
- Activating a valid key on the computer removes the banner there and on paired phones at once; removing it brings the banner back.
- No horizontal or vertical scroll in the Deck with 2-column sliders.
- `npm run typecheck` and `npm test` pass.

## Pending on the user
- Create the Lemon Squeezy store and the USD 12 product (license keys enabled); give the store id, product id and checkout URL.
- A public https URL for the ad feed JSON.

## Progress
- Created 2026-11-11.
- 2026-11-11: L1–L3 done. `npm run typecheck`: exit 0. `npm test`: core 198, desktop 250, electron 24, mobile 384 tests passing.
- Scrollbar root cause: `.deck-page.visually-hidden` (the Deck page number) kept `min-width: 8em` from `.deck-page`, which beat the 1px width of `.visually-hidden`, so the absolutely positioned box stuck 5px past `.app-main` and `overflow-y: auto` scrolled sideways. It was not caused by the sliders. Fix: `.visually-hidden` forces its size with `!important`. Measured in headless Chrome on the built app (5×4 Deck, two 1×3 sliders): `.app-main` scrollWidth 1099 vs clientWidth 1094 before; equal at 1270×820, 1000×700, 390×844, 844×390 and 1600×900 after, with the banner shown.
- Contract additions beyond the design: `LicenseResponse` also carries `canActivate` (false when no store/product is configured) and `checkoutUrl`; error codes `license-invalid` (400), `license-wrong-product` (400), `license-limit` (409), `license-offline` (503), `license-disabled` (409); PUT/DELETE `/api/license` are loopback-only. Feed format is `{ "ad": Creative | null }`; `null` removes the sponsor.
- Known limits: the OBS dock shows no banner; phones served by the computer load the sponsor once per page load (no ad-changed event); "Remove license" refuses (keeps the key) when Lemon Squeezy cannot be reached.

## Next step
- User: create the Lemon Squeezy store/product and the feed, then fill `apps/desktop/src/config/monetization.ts` or the env vars. Manual check in the packaged app: sponsor link and Buy open in the system browser.
