# National Trading — native app (Expo / React Native)

The customer ordering app as a **real native app** for iOS + Android, talking to the
live backend (`https://ntbf-platform.onrender.com`). One codebase → both app stores.

## Run it on your phone (test with Expo Go — free, no store needed)

1. **On your PC**, in a terminal:
   ```bash
   cd apps/native
   npm install        # first time only (a few minutes)
   npx expo start --tunnel
   ```
   (`--tunnel` lets your phone connect even if it's on mobile data / a different Wi-Fi.)

2. **On your phone**, install **Expo Go**:
   - iPhone → App Store → "Expo Go"
   - Android → Play Store → "Expo Go"

3. A **QR code** appears in the terminal:
   - iPhone → open the **Camera** app → point at the QR → tap the banner
   - Android → open **Expo Go** → **Scan QR code**

4. The **National Trading** app loads on your phone. Register or sign in, browse the
   428-product catalog, add to cart, and place an order — it goes to your live backend
   (the same orders show up for staff in the web app's "Online" tab).

## What this is
- **Customer ordering app** — the public-facing app, built native first because it has a
  clean, secure per-account API (`/api/portal/*`). Each customer signs in and sees only
  their own orders.
- Business logic + flows are ported from the web prototype; the UI is real React Native.

## Next steps toward the stores
- **Staff app** (native version of the field app) — next.
- **Publish:** `npx eas build` (Expo's cloud build — no Mac needed for iOS), then submit to
  the App Store (Apple Developer, $99/yr) and Play Store ($25 one-time).
- **Catalog:** currently bundled (`catalog.json`); switch to a live `GET /api/catalog`
  endpoint so prices/products update without an app release.

## Config
API base is set at the top of `App.js` (`const API = ...`). Point it at your own domain
once `app.ntbfllc.com` DNS is live.
