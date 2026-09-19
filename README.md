# Tamil Web Series

Created by [gdhanush27](https://github.com/gdhanush27).

An Expo SDK 57 app ported from `app.py`. Website requests and HTML parsing run directly on the device, with no Python runtime, account, cloud storage, proxy, or custom API server.

Catalog, series, season, and episode searches support natural A-Z and Z-A sorting. Episodes can be resolved, played, and downloaded. Download files and metadata stay on the device and remain available from the Downloads tab.

## App flow

1. Enter a source domain.
2. Search the catalog and browse series, seasons, and folders.
3. Select episodes individually, select all visible episodes, or enter ranges such as `1-3,5-6`.
4. Resolve links with progress, cancellation, and retry support.
5. Play resolved media or download episodes for local playback.

## Get started

Install dependencies and start Expo:

```powershell
npm install
npm start
```

To build and run Android locally, install Android Studio and an Android SDK, then run:

```powershell
npm run android
```

For an existing development client, start Metro with:

```powershell
npm run start:dev
```

## Runtime notes

- Android and iOS make source requests directly. Native requests are not subject to browser CORS, but redirects, cookies, TLS, regional restrictions, and browser verification can still prevent access.
- Web displays an unsupported message and does not make catalog requests.
- Navigation, listings, selections, and resolved results are session-only.
- Downloaded files and their AsyncStorage metadata remain local to the device. Deleting a download removes both.
- Keep the app foregrounded while resolving or downloading. Media links may expire or require source cookies.
- Access only sources and content you are authorized to use.

## Validation

```powershell
npm test
npm run typecheck
npm run lint
```

The offline tests cover parsing and link resolution. Playback, downloads, sharing, clipboard behavior, and live-site networking require device testing.

The main implementation is in `src/components/series-browser.tsx` and `src/lib/series-client.ts`. The original `app.py` remains unchanged.
