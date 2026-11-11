# Android client app

## Objective
Ship Speed Deck on Android as a real installable app (Play Store) that controls the desktop server on the same network.

## Problem / why
Chrome cannot install the PWA from `http://<LAN IP>:4545` (no secure context), so phones only get a browser shortcut.

## Approach (decided)
A thin native Android shell (Kotlin, plain Views, no Capacitor):
- First run: a native connect screen. Scan the desktop's pairing QR (Google code scanner, no camera permission) or type the address.
- The address is saved and opened in a full-screen WebView; the UI is always served by the desktop, so phone and desktop versions never drift.
- When the desktop cannot be reached: a native screen to retry or change computer.
- Cleartext HTTP is allowed (LAN IPs cannot be listed in advance).

## Scope
- `apps/android/` Gradle project (+ thin `package.json` wrapper with non-default script names so root `npm run build` does not need Java).
- No changes to the desktop server or the mobile web app.
- Out of scope: Play Console upload and signing keys (user-owned), iOS, Windows.

## Constraints
- applicationId `com.alejoxcode.speeddeck` (confirmed by the user 2026-11-11; permanent after first Play upload).
- minSdk 26, target/compile SDK 36, JDK 21 (`/opt/homebrew/opt/openjdk@21`), Gradle wrapper.
- English for code, comments and UI strings, plus a Spanish `values-es` translation.

## Tasks
- [x] T1 Scaffold the Gradle project and the WebView shell that opens a saved address (cleartext, back navigation, keep screen on); debug APK builds. Route: delegated (writer, new multi-file project). Commit `5b423f9`.
- [x] T2 Connect screen: QR scan + manual entry, address validation with unit tests. Route: delegated. Commit `65481fb`.
- [x] T3 Unreachable-desktop screen (retry / change computer) and a way to change computer from the deck. Route: delegated. Commit `82f7de8`.
- [ ] T4 Release build: app icon, versioning, signed AAB from a user-provided keystore (documented, not committed). Route: delegated.

## Acceptance criteria
- `./gradlew assembleDebug` and `./gradlew test` pass.
- On a phone on the same Wi-Fi: scan the QR, the deck loads and works; relaunching opens the deck directly.
- Desktop off: the unreachable screen shows and retry works once it is on.

## Progress / evidence
- Toolchain: JDK 21 (Homebrew), Android SDK platform 36, build-tools 36.0.0, Gradle 9.9.1 installed.
- Versions: Gradle wrapper 9.9.1, AGP 9.5.1 (built-in Kotlin, no separate Kotlin plugin), appcompat 1.7.1, play-services-code-scanner 16.1.0, JUnit 4.13.2.
- The pairing QR encodes `http://<LAN IP>:4545/` (`lanUrls[0]`); `DesktopAddress.normalize` returns exactly that shape.
- T2 test-first: 13 `DesktopAddressTest` cases observed RED against a `TODO()` stub, then GREEN.
- T1–T3 checks: `./gradlew test` (13 tests, 0 failures) and `./gradlew assembleDebug` pass; APK at `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
- Pending: on-device acceptance (scan, relaunch, desktop-off retry) not yet run.
- Root `package-lock.json` refreshed with the `@speed-deck/android` workspace entry.

## Next step
Try the debug APK on a phone, then T4.
