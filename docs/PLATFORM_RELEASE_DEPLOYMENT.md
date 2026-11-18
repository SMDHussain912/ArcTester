# ArcTester platform release and deployment

This guide describes the supported release topology:

- Web: Vercel static hosting (Vite output in `web/dist`).
- API: Render Docker web service using the repository root as build context and `api/Dockerfile`.
- Database: Render PostgreSQL, using its internal connection string from the API service.
- Mobile: Expo native application using the API bearer-token endpoint.
- Desktop: Electron application packaging the web build and using the API bearer-token endpoint when configured by the web app.

## Vercel

Import the repository and keep the project root at the repository root.

- Install command: `npm ci`
- Build command: `VITE_BASE_PATH=/ npm run build:web`
- Output directory: `web/dist`
- Environment variable: `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com`

The committed `vercel.json` configures these values, SPA route fallback, immutable caching for hashed assets, and conservative response headers. `VITE_API_URL` is compiled into the browser bundle, so redeploy after changing it.

The normal web build intentionally retains relative asset URLs for Electron's `file://` packaging. The Vercel build overrides the Vite base to `/` so deep links such as `/assignments` resolve their assets correctly.

## Render API

Create a Docker web service from the repository. Use the root directory as Docker context; do not set the service root to `api`.

The `render.yaml` blueprint points Render at `api/Dockerfile`, sets `/health` as the health check, and declares the required secret environment variables.

Set these values in the Render dashboard:

- `DATABASE_URL`: Render PostgreSQL internal URL, including `?schema=public`.
- `JWT_SECRET`: unique random value of at least 32 bytes; generate with `openssl rand -hex 32`.
- `CORS_ORIGINS`: exact deployed Vercel origin (for example `https://your-app.vercel.app`) **and** `arctester://app`, comma-separated with no trailing slashes on HTTPS origins. The custom origin is used by the packaged Electron app.
- `COOKIE_SAME_SITE=None`: needed for the current cross-site Vercel/Render cookie session.
- `NODE_ENV=production`.

The Docker entrypoint applies PostgreSQL migrations before starting the API. The image exposes the configured `PORT` and provides a container health check. Keep the PostgreSQL database on Render's private network and use the internal URL.

### Browser cookie limitation

A default `*.vercel.app` frontend and `*.onrender.com` API are cross-site. The API uses `SameSite=None; Secure` and exact-origin CORS, but browsers that block third-party cookies can still prevent cookie-based web login. For reliable browser sessions, use custom domains under the same registrable domain (for example `app.example.com` and `api.example.com`) or introduce a same-origin API proxy. Do not weaken cookie security to work around browser privacy controls. The packaged Electron app serves its local bundle from the privileged `arctester://app` origin; add that exact origin to `CORS_ORIGINS` as shown above.

After deployment, verify sign-in, refresh, protected API calls, logout, and direct navigation to a nested route in desktop and mobile browsers.

## Expo mobile

Set `EXPO_PUBLIC_API_URL` to the HTTPS Render API origin before building a release:

```bash
cd mobile
EXPO_PUBLIC_API_URL=https://YOUR-RENDER-SERVICE.onrender.com npx expo export --platform android
```

For a native Android build, use the existing EAS/Gradle release configuration and ensure the same variable is available at build time. Native clients authenticate with `POST /auth/token` and send `Authorization: Bearer <token>`; they do not depend on browser cookies or CORS.

The Android exam-guard interruption marker is stored with Expo SecureStore. Native integrity features require an installed development/release build; Expo Go does not include the custom ExamGuard native module.

## Electron desktop

Build the web app with the default relative Vite base before packaging:

```bash
npm run build:web
npm run test --workspace=desktop
npm run pack --workspace=desktop
```

For Windows distribution use the existing `dist:win` script on a Windows build host. The Electron main process serves the packaged web bundle from the privileged `arctester://app` origin so the API can allow a specific desktop origin without opening production CORS to the opaque `null` origin. The preload exposes only a narrow exam-mode toggle and integrity-event subscription; renderer code does not receive Node.js or unrestricted IPC access.

## Release verification

Run the following from the repository root:

```bash
npm run typecheck --workspace=web
npm run build:web
npm run test --workspace=web
npm run typecheck --workspace=mobile
npm run test --workspace=mobile
npm run test --workspace=desktop
npm run build:api
```

A successful build does not prove provider configuration, browser cookie behavior, Android native module behavior, or desktop exam-mode behavior on every operating system. Verify those on real deployed/browser/device targets before calling the release production-ready.
