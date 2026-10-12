# Google login + cloud sync — setup checklist

"Continue with Google" signs the user in through **Supabase Auth** and
mirrors their diary (voice entries, text diary, saved translations) to a
`diary_data` table keyed by their Google user id. Signing in on any
device creates the same Google-owned profile and pulls everything down.

Everything below is a **one-time** setup. Until it's done the app still
works exactly as before (local profiles only) and the Google button just
shows a hint when tapped.

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Anon / publishable key** → `VITE_SUPABASE_ANON_KEY`
3. Copy `.env.example` to `.env.local` and paste both values.
   (`.env.local` is git-ignored — never commit these.)

## 2. Create the database table

In **SQL Editor → New query**, paste the whole of
[`supabase/migration.sql`](supabase/migration.sql) and press **Run**.
This creates `diary_data` with row-level security, so a user can only
ever read/write their own rows.

## 3. Create the Google OAuth client

1. In <https://console.cloud.google.com> create (or pick) a project and
   configure the **OAuth consent screen** (External + test users, or
   publish).
2. **Credentials → Create credentials → OAuth client ID → Web
   application** with this authorized redirect URI:

   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```

3. Copy the **Client ID** and **Client secret**.

## 4. Enable the Google provider in Supabase

**Authentication → Providers → Google** → paste the Client ID and
Client secret → **Save**.

## 5. Allow the app's redirect URLs

**Authentication → URL Configuration → Redirect URLs** → add:

```
voicediary://login-callback      <- Android deep link (custom scheme)
http://localhost:5173/           <- local dev server
https://YOUR-DOMAIN/             <- production web, if any
```

## 6. Rebuild the Android app

```bash
npm run build
npx cap sync android
```

(The custom scheme callback is registered in
`android/app/src/main/AndroidManifest.xml`; `npx cap sync` keeps the
native project in step with the web build.)

## How it behaves

- **Sign-in (Android):** the consent screen opens in a Chrome Custom
  Tab — never in the WebView, which Google rejects with
  `403 disallowed_useragent`. On return, the `voicediary://login-callback`
  deep link exchanges the PKCE code for a session.
- **Sign-in (web):** standard Supabase redirect round trip.
- **Data:** on sign-in the app creates/re-activates the profile
  `g-<google-user-id>`, downloads all `diary_data` rows and **merges**
  them with what's already on the device (union by id, newer edit wins).
  Nothing local can ever be lost by a sync.
- **Uploads:** every save in the voice diary, text diary and
  translator is pushed (debounced ~1.2 s) — but **only** while the
  Google-owned profile is active. Local profiles never sync.
- **Sign out:** local data stays on the device; the app asks which
  profile to use next.

### Known limitations (v1)

- A delete on a device is uploaded immediately (verified live: the
  `diary_data` row drops to 0 items within seconds). But another device
  that still has that entry locally will union it back on its next pull,
  so a cross-device delete only sticks once every device has pushed.
  Sync is biased toward **never losing data**.
- `vd_diary_pin` (per-profile diary PIN) and the voice draft are not
  synced — they stay device-local on purpose.
- Cloud rows contain plain JSON (protected by HTTPS in transit,
  row-level security + Supabase encryption at rest). Local storage keeps
  its device-side XOR encryption either way.
