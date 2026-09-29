# ClassActionForMe iPhone app

An Expo client (SDK 57, React Native 0.86, TypeScript, Expo Router) that talks to the same API as the
web app in the repo root.

## Layout

```
app/
  _layout.tsx            root stack, theme, AppStateProvider
  (tabs)/index.tsx       Home: search, "What do you own?", claims open now, status filters, infinite index
  (tabs)/items.tsx       My Items: device-only list, matched to active lawsuits
  (tabs)/scan.tsx        Scan: live camera + library, brand chips, "Add to My Items"
  (tabs)/watchlist.tsx   Follow brands by email
  (tabs)/settings.tsx    Privacy, API base URL, about
  results.tsx            Matched brands with their lawsuits
  case/[id].tsx          Case detail
  bank-scan.tsx          Plaid privacy explainer + scan (modal)
components/              UI primitives (ui.tsx), case components, chip editor, theme
lib/
  api.ts                 typed client for every endpoint in PLAN.md
  store.tsx              My Items + follows (AsyncStorage) and last results (memory)
  image.ts               downscale to a 1600px JPEG before upload
  calendar.ts            add a claim deadline through the iOS event sheet
  plaid.ts               lazy-loads react-native-plaid-link-sdk (absent in Expo Go)
  notifications.ts       push scaffold (not wired yet)
```

## Shared types

The app imports the web app's contracts directly:

```ts
import type { CaseDetail } from '@shared/types'; // -> ../src/lib/types.ts
```

- In `tsconfig.json`, `paths` maps `@shared/types` to `../src/lib/types.ts` for type checking.
- `metro.config.js` adds `../src/lib` to `watchFolders` and resolves `@shared/types` to that file.
  That way runtime values such as `CASE_STATUSES` and `ACTIVE_STATUSES` get bundled too.
- EAS Build uploads the whole git repository, so the file outside `mobile/` is available there.
- Fallback: if you ever build `mobile/` outside the repo, run `npm run sync-types`, which copies the
  file to `mobile/shared/types.ts`. Then point both aliases at that copy.

Keep `src/lib/types.ts` free of imports so it stays portable.

## Run

```sh
cd mobile
npm install
cp .env.example .env            # set EXPO_PUBLIC_API_URL
npx expo start                  # press i for the iOS simulator, or scan the QR code with Expo Go
```

Start the API first (`npm run dev` in the repo root, on port 3000).

- **Simulator:** `http://localhost:3000` works.
- **Physical iPhone:** use your Mac's LAN IP, for example `EXPO_PUBLIC_API_URL=http://192.168.1.20:3000`.
  `EXPO_PUBLIC_*` variables are inlined into the bundle at build time, so after changing one, restart
  with `npx expo start -c`.
- **Expo Go** runs everything except the bank scan, because Plaid includes native code. In Expo Go the
  bank scan screen explains this instead of crashing.

If the server has a feature switched off (for example, missing Anthropic or Plaid keys), the API
returns 503. The app then shows "isn't available right now" for that feature, and everything else
keeps working.

Checks:

```sh
npm run typecheck               # tsc --noEmit
npx expo-doctor
```

## Development build (needed for Plaid)

`react-native-plaid-link-sdk` only works in a development build. It does not work in Expo Go.

```sh
npm install -g eas-cli
eas login
eas init                        # writes the EAS project ID into app.json
eas build --profile development-simulator --platform ios   # simulator .app
eas build --profile development --platform ios             # device build (register the device first: eas device:create)
npx expo start --dev-client
```

Or build locally with Xcode: `npx expo run:ios`. This runs prebuild and creates `ios/`, which is
gitignored.

## EAS build and TestFlight

Profiles in `eas.json`:

| Profile | Use | API URL |
|---|---|---|
| `development` / `development-simulator` | dev client | `http://localhost:3000` |
| `preview` | internal ad-hoc builds | staging placeholder |
| `production` | App Store / TestFlight | production placeholder |

Replace the placeholder URLs in `eas.json` before building.

1. Join the Apple Developer Program. In App Store Connect, create the app with bundle ID
   `com.classactionforme.app`. This ID is a placeholder; if you use a different one, change
   `ios.bundleIdentifier` in `app.json`.
2. Put the `ascAppId` and `appleTeamId` values in `eas.json` → `submit.production.ios`.
3. Run `eas build --profile production --platform ios`. EAS manages certificates and profiles.
4. Run `eas submit --profile production --platform ios --latest` to upload the build to TestFlight.
5. In App Store Connect, add testers under TestFlight and fill in the privacy label:
   - Scan photos and bank data are not collected (they are processed and discarded).
   - Email is collected only for brand alerts.
6. In the App Review notes, say that the app gives information, not legal advice. "Apply" opens the
   official settlement administrator's site, and no claims are filed in the app. Give reviewers a
   sample case ID.

## Plaid iOS setup

1. In the Plaid Dashboard, go to **Team settings → API → Allowed redirect URIs** and add the HTTPS
   redirect URI. The placeholder is `https://classactionforme.com/plaid/oauth`, which is also in
   `app.json` → `extra.plaidRedirectUri`.
2. When `platform` is `"ios"`, the server must create the link token with that `redirect_uri`. The
   app sends `{ platform: "ios" }` to `POST /api/plaid/link-token`.
3. Set up the universal link:
   - `app.json` declares `associatedDomains: ["applinks:classactionforme.com"]` (placeholder).
   - Serve `https://classactionforme.com/.well-known/apple-app-site-association`, listing
     `<TEAMID>.com.classactionforme.app` with the `/plaid/oauth*` path.
   - Enable the Associated Domains capability for the App ID. EAS does this automatically when it
     manages credentials.
4. Sandbox works without OAuth institutions. OAuth banks such as Chase need steps 1–3 and Plaid
   production approval.
5. Rebuild the dev client after any change to native configuration.

## Permissions (Info.plist)

These are set in `app.json` and through the config plugins:

- **Camera:** scanning a shelf.
- **Photo library:** picking a photo of products or a receipt.
- **Calendar (write-only):** adding claim deadlines through the system sheet.

Each permission string explains why the app needs it and says that photos are never stored.

## Not done yet

- Push notifications: `lib/notifications.ts` is a scaffold only. The API doesn't have a push-token
  endpoint yet.
- Share sheet extension for sharing a product page or receipt into the app.
