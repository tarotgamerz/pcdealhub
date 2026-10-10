# TarotAI Android Companion — starter implementation

This native Android companion complements the hosted TarotAI web console.

## Current capabilities
- Phone-first home screen.
- Opens a curated list of installed apps using Android launch intents.
- Offers Back, Home and Recents after the owner manually enables the Accessibility Service in Android Settings.
- Does not collect screen content, click arbitrary UI, type into other apps, or silently enable permissions.

## Current limitation
This starter is **not connected to TarotAI's cloud agent/task system yet**. Remote AI commands, pairing, authenticated command polling and a visible approve/deny queue must be implemented and security-reviewed before an agent can request device actions. Current device actions are initiated by the person using this app.

## Build
Open this folder in Android Studio with an Android SDK installed, then build and install the debug app on your own device. Check Android Gradle Plugin compatibility with your Android Studio version before building.

## Permission and safety
The navigation service is optional. Android requires the owner to enable it manually in Accessibility settings. Disable it from Android Settings at any time.

## Next steps
1. Add secure pairing using a short-lived owner-approved device token.
2. Add a server-backed command queue with expiry, replay protection and allowlisted actions.
3. Show a confirmation screen before each requested app launch or navigation command.
4. Connect approved commands to the TarotAI task orchestrator.
5. Build and test on a physical Android phone before claiming the feature is ready.
