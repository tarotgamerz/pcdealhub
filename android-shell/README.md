# TarotAI Android shell

This folder is a small Android WebView app for personal installation. It opens the HTTPS TarotAI service at `https://tarotai-core.vercel.app`; the UI and server-side APIs continue to deploy through Vercel. It does not contain API keys or exchange credentials.

## Build

The GitHub Actions workflow builds `TarotAI.apk` and publishes it as a GitHub Release. The Vercel download page is:

`https://tarotai-core.vercel.app/download`

A first build is triggered when these files are merged into the active TarotAI deployment branch, or via the workflow's manual run option.

## Stable APK signing (recommended)

Without a persistent signing key, the workflow falls back to a debug-signed APK for a first install. A later build signed by a different runner key cannot update that installed copy in place; uninstall the old app first (this removes app-local session data).

For in-place updates, create a private Android upload keystore and add these repository **Actions secrets**:
- `ANDROID_KEYSTORE_BASE64`: base64-encoded keystore file
- `ANDROID_KEY_ALIAS`: alias inside that keystore
- `ANDROID_KEYSTORE_PASSWORD`: keystore password
- `ANDROID_KEY_PASSWORD`: key password

Never commit the keystore or passwords to the repository, and do not send them in chat. These secrets only sign the APK; they are not included in the app.

This is an initial personal-use wrapper, not a claim that live trading is safe or enabled. Continue using TarotAI's existing authentication, server-side risk checks, and paper-trading defaults.
