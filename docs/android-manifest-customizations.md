# Android Manifest + resource customizations

The Capacitor-generated `android/` folder is gitignored (see `.gitignore`),
so changes to `android/app/src/main/AndroidManifest.xml` AND the icon /
splash PNGs don't travel with the repo. This file documents the
customizations we hand-apply so the manifest + assets can be
re-created on a fresh clone or after `npx cap add android`.

For the icons + splash specifically: run `scripts/generate-icons.sh`
once after a fresh `cap add android`. It reads `resources/icon.png`
and writes all 16 mipmap + 11 splash PNGs into the right directories
via ImageMagick. The script is fast (~5 seconds) and idempotent.

When to apply: after `npx cap add android` on a fresh checkout, OR after
manually deleting `android/`. Capacitor's `npx cap sync` only patches
specific plugin sections of the manifest — our custom permissions and
deep-link intent filter survive `cap sync` runs without intervention,
so you only need this file when starting from a blank `android/`.

## 1. Permissions

Inside `<manifest>`, AFTER the `<application>` block, add:

```xml
<!-- Detect online/offline + WiFi vs cellular. -->
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- GPS / Location — for "find places nearby" on /map. We request
     runtime permission only when the user taps the locate button. -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<!-- Background audio playback (Azure TTS during screen-off). -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<!-- Notifications (Android 13+ requires explicit permission). -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

(The default INTERNET permission ships in the Capacitor template; keep it.)

## 2. OAuth deep-link intent filter

Inside the `<activity android:name=".MainActivity" …>` block, AFTER the
existing LAUNCHER intent-filter, add a second filter for the custom URL
scheme that Supabase redirects to at the end of the Google OAuth flow:

```xml
<intent-filter android:autoVerify="false">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.lokali.app" />
</intent-filter>
```

Without this filter the OAuth callback at `com.lokali.app://auth/callback`
fails to launch the app and users get stranded on Chrome after picking
their Google account. The handler in `src/hooks/useCapacitorBridge.ts`
picks up the URL via Capacitor's `appUrlOpen` event and calls
`supabase.auth.exchangeCodeForSession`.

## 3. Verification

After applying, run:

```sh
npx cap sync android
cd android && ./gradlew assembleDebug
```

Inspect `android/app/src/main/AndroidManifest.xml` — all the lines above
should be present. If a future @capacitor/* plugin install adds duplicate
location permissions, that's harmless; Android merges duplicates at build.
