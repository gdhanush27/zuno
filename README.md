# Tamil Web Series

Created by [gdhanush27](https://github.com/gdhanush27).

Native Expo SDK 57 app ported from `app.py`. Website requests and HTML parsing run directly on the phone. No Python runtime, proxy, API server, or application backend is used.

Catalog, series, season, and episode searches offer **Name A–Z** and **Name Z–A** sorting with natural number order (Episode 2 before Episode 10). The sort preference stays active as you browse; selected episodes stay selected when sorting. Number ranges refer to the currently displayed order.

## App flow

1. Enter a source domain (session-only; defaults to the CLI source).
2. Search the catalog, then browse series, seasons, and folders.
3. Tap episodes, select all visible episodes, or enter displayed numbers/ranges such as `1-3,5-6`.
4. Resolve links with progress and cancellation. Failed episodes do not stop the batch; retry keeps successful results.
5. Copy or open individual links, copy the report, or share a UTF-8 TXT report through the native share sheet. No media is downloaded by the app.

## Runtime requirements and limits

- Android/iOS with an Expo Go version compatible with SDK 57. During development, Metro serves the JavaScript bundle; it is not a data proxy/backend. An installed production build does not need Metro.
- Use supported Node LTS (for example Node 22.13+ or Node 24.3+). This machine's Node 21 produces engine warnings, although validation builds completed.
- Native requests are not subject to browser CORS. Website availability, redirects, cookies, TLS, regional restrictions, or browser-verification requirements can still prevent direct access. No challenge bypass or proxy fallback is implemented.
- HTTPS is recommended. Plain HTTP can be blocked by platform policy, especially in Expo Go, whose native settings this project cannot change.
- Web displays an unsupported message and makes no catalog requests; browser CORS would otherwise depend on the source site's permission.
- Source selection, navigation, listings, and resolved results are session-only. TXT files are staged in the app cache for sharing. Use the share sheet to save a permanent copy where supported by your installed apps.
- Keep the app foregrounded while resolving. Exported links may expire, require cookies, or fail in external apps.
- HTML selectors and the three link-stage host/path rules mirror the CLI and must be updated if the website changes. Access only sources and content you are authorized to use.

## Validation

`npm test` runs 10 offline fixture tests covering parsing, normalization, ranges, pagination, cache/refresh, redirects, link stages, cancellation, errors, and reports. `npm run typecheck` checks TypeScript. Android, iOS, and web export bundles were also validated. Live-site networking, native UI interaction, clipboard, and TXT sharing still need real-device testing in Expo Go.

Main implementation: `src/components/series-browser.tsx` (UI) and `src/lib/series-client.ts` (direct client). The original `app.py` is unchanged.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
