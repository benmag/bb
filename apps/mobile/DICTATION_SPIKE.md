# CallKit + Nitro dictation spike

## Source of truth (do not rely on `node_modules`)

iOS behavior is split between **our app code** and a **pnpm patch** on upstream `react-native-nitro-speech@0.4.9`. Edits in `node_modules` are discarded on install and omitted from EAS builds unless they are committed through the patch.

| What | Where |
|------|--------|
| Session, CallKit, batch merge, composer sheet | `apps/mobile/src/lib/voice-dictation/`, `ComposerDictationSheet.tsx`, `plugins/with-voice-dictation.js` |
| Native engine (lock screen, audio engine, batch finals) | `patches/react-native-nitro-speech@0.4.9.patch` at repo root (`package.json` → `pnpm.patchedDependencies`) |

The patch touches only `ios/Engines/AnalyzerEngine.swift`, `DictationRuntime.swift`, and `RecognizerEngine.swift`.

To change native code: `pnpm patch react-native-nitro-speech@0.4.9 --edit-dir <dir>`, edit, then `pnpm patch-commit '<dir>'`. Rebuild the IPA and confirm the build log has **no** `Could not apply patch` for nitro-speech. Upgrading the package version requires repeating that flow; pin the version if you need to avoid surprise drift.

## On device (required)

CallKit and background mic do not validate on the iOS Simulator. Use a physical iPhone with a development build.

## Local dev client

```bash
cd apps/mobile
pnpm install
pnpm exec expo prebuild --platform ios
(cd ios && pod install)
pnpm ios
```

## Standalone spike screen

On a **dictation-spike** Stevu build: **This device → Dictation spike**.

In a **dev** client, open `bb://dev/voice-dictation-spike` or `/dev/voice-dictation-spike`.

Start dictation, press Home, keep talking, return to the app and check whether transcript batches continue.

## Composer (WebView)

When the shell handshake includes `voice-dictation` (iOS only), the existing mic uses native dictation instead of `MediaRecorder` + server transcription.

While dictation is recording, the WebKit composer is hidden and a native sheet owns the text. Speech is appended into that field, and typing edits it directly. The record button pauses and resumes recognition without leaving the sheet. Done inserts the field's text into the composer; discard throws it away. The page opens the sheet with `composer-dictation-keyboard` and receives `composer-dictation-commit` (bridge version 9).

## EAS build (separate Expo app slug)

Profile `dictation-spike` in `eas.json` sets `BB_MOBILE_VARIANT=dictation-spike` so the native app is **bb dictation spike** (`app.getbb.mobile.dictation-spike`).

1. Log in: `cd apps/mobile && pnpm exec eas login`
2. Expo project: reuse **Stevu** ([@benmagg/stevu](https://expo.dev/accounts/benmagg/projects/stevu), `a6586611-fa47-43b6-b2be-51faac776272`). The `dictation-spike` profile sets `com.stevu.app` so existing signing keeps working.
3. **Installable on device (embedded JS):** `bash scripts/ios-dictation-spike-release.sh` builds locally and installs onto the connected iPhone with `xcrun devicectl`. Pass `--upload` to also register the build on Expo. `IOS_DEVICE` selects the phone when more than one is connected. Cloud alternative: `eas build --profile dictation-spike-installable --platform ios`.
4. **OTA (shell JS only, same runtime version):** after an installable build with `expo-updates`, run `eas update --channel dictation-spike --message "…"`. Native modules (Nitro/CallKit) still need a new IPA.
5. **Composer mic in the WebView** needs the same `apps/app` revision on your bb server (e.g. benm.getbb.app), not only the mobile shell.
6. **Dev client only (needs Metro on your Mac):** `pnpm exec eas build --profile dictation-spike --platform ios`
7. First device build: Apple credentials must exist on the Expo account (run the same command once in **interactive** mode on a machine with a browser, or configure credentials in the Expo dashboard).

## Background pass criteria

- CallKit starts with dictation, while Stevu is still frontmost, so iOS never activates the app to place the call. Starting it after backgrounding pulls the user back out of whatever app they switched to
- CallKit ends when dictation stops
- Switching to another app during dictation leaves Stevu in the background and keeps the transcript running
- Nitro partial results continue after backgrounding **or** reliably resume on foreground without losing the CallKit session
- Composer receives live `voice-dictation-partial` events (foreground) and `voice-dictation-sync` after `resume` if needed