# Free AI Agent for Android

A native Android app for the `build-ai-agents-free` project. It runs directly on a phone—no Termux, Python runtime or local server required.

## What it does

- Chats through Groq's `openai/gpt-oss-120b` model.
- Falls back to Google's `gemini-3.6-flash` when enabled and configured.
- Runs a bounded agent loop with three allow-listed on-device tools: safe arithmetic, word count, and current device date/time.
- Keeps up to 200 recent messages within a 500,000-character encrypted storage budget.
- Encrypts API keys, settings and history with an Android Keystore AES-256-GCM key.
- Uses Material 3, dynamic colour, dark mode, right-to-left-safe icons, selectable answers and accessible control labels.
- Requests only the Android `INTERNET` permission. It has no analytics, ads or cleartext network traffic.

The app does not browse the live web. Use the Colab notebook in `../colab/` for the repository's Python agent with DuckDuckGo search.

## Install the test APK on a Samsung A55

The Samsung A55 is supported. The app requires Android 8.0 or newer and targets Android 17.

1. Download `app-debug.apk` from the successful **Android** GitHub Actions run, or build it with the command below.
2. Open the APK from Chrome or My Files.
3. If Android asks, allow that app to **install unknown apps**, then return to the installer.
4. Review the installer and tap **Install**. You can turn the unknown-app permission off again afterward.
5. Open **Free AI Agent**, paste a Groq key, optionally add a Gemini fallback key, and save.

The debug APK is for testing and is signed with Android's standard debug certificate. A public release must be signed with a private upload key or Google Play App Signing.

## API keys

- Groq: <https://console.groq.com/keys>
- Gemini fallback: <https://aistudio.google.com/app/apikey>

Keys are never compiled into the app or placed in URLs. Requests go directly from the phone to the chosen provider over HTTPS. Provider free-tier limits and data-use terms can change; do not send confidential material to a free service.

## Build and verify

Requirements: JDK 17 and Android SDK Platform 37.0 with Build Tools 36.0.0.

```bash
cd android-app
./gradlew testDebugUnitTest lintDebug assembleDebug assembleRelease
```

Outputs:

- Installable test build: `app/build/outputs/apk/debug/app-debug.apk`
- Optimized unsigned release build: `app/build/outputs/apk/release/app-release-unsigned.apk`
- Test report: `app/build/reports/tests/testDebugUnitTest/index.html`
- Lint report: `app/build/reports/lint-results-debug.html`

Lint treats every non-documented warning as an error. Release builds enable R8 code shrinking and resource shrinking.

## Make a signed production build

In Android Studio, choose **Build → Generate Signed App Bundle or APK**, create or select a private upload key, and generate an Android App Bundle for Google Play. Never commit a keystore, its passwords, API keys or `local.properties`.

## Security boundaries

- Tool names are allow-listed; the model cannot run shell commands or arbitrary code.
- Tool rounds, calls, arguments, results, prompts, messages and persisted history are size-limited.
- Device backups and device-to-device transfer exclude all shared preferences.
- `usesCleartextTraffic=false` and a network security policy block HTTP.
- API failures are converted to short user-safe messages; keys are not logged.
- Erase Everything removes keys, settings and history from app storage. Uninstalling also removes them.

No software can be guaranteed perfect on every device or provider outage. The project therefore uses automated tests, strict lint, release shrinking checks, bounded retries, network timeouts and a provider fallback, followed by real-device acceptance testing before production release.
