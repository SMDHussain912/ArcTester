# ArcTester platform architecture

## Applications

- **Web:** React + TypeScript + Vite. This is the browser application and the shared UI foundation for desktop.
- **Mobile:** Expo + React Native + TypeScript. Android and iOS use the same API and bearer-token authentication.
- **Windows desktop:** Electron shell. It hosts the built web application and keeps Node.js integration isolated from the renderer.
- **Backend:** Existing Express + Prisma API remains the single source of truth for accounts, questions, tests, attempts, and results.

## Authentication

- Web uses the existing httpOnly session cookie.
- Native clients call `POST /auth/token`, store the bearer token in platform-secure storage, and send `Authorization: Bearer <token>`.
- The API's existing auth middleware accepts both session cookies and bearer tokens.

## API configuration

- Web: `VITE_API_URL`
- Expo: `EXPO_PUBLIC_API_URL`
- Desktop: uses the same web build and its configured API URL.

For a physical phone, use the computer's LAN IP rather than `localhost`. The API CORS allowlist must include the web origin. Native fetch requests do not use browser CORS enforcement, but the API must still be reachable over the network.

## Windows packaging

Electron Builder produces a Windows NSIS installer using `npm run dist:win` from `desktop/`. The web Vite production build must exist at `web/dist/index.html` before packaging.

## Migration rule

The React + Vite application is now the default web target. The previous Next.js route components and tests remain temporarily as migration references while equivalent flows are consolidated and retested in the Vite app. Remove Next.js dependencies and legacy files only after all required flows and tests have been migrated.
