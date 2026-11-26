# Platform release and deployment

ArcTester consists of a Vite web app, Express API and Expo Android app. Android is the primary student experience; web administration is browser-only.

## Vercel — web

- Project root: repository root.
- Install command: `npm ci`.
- Build command: `VITE_BASE_PATH=/ npm run build:web`.
- Output directory: `web/dist`.
- Environment: `VITE_API_URL=https://<your-api>.onrender.com`.

The API URL is compiled into the static bundle. Redeploy after changing it.

## Render — API

Use the repository root as the Docker build context and `api/Dockerfile` as the Dockerfile. Do not set the service root to `api`; the build needs root workspace manifests and the lockfile.

Required environment: `DATABASE_URL` (Render PostgreSQL internal URL with `?schema=public`), `JWT_SECRET` (unique random secret), exact `CORS_ORIGINS`, `COOKIE_SAME_SITE=None` when web and API are cross-site, and `NODE_ENV=production`.

The API applies PostgreSQL migrations at startup. Do not apply SQLite migration history to the hosted PostgreSQL database.

## Android

```bash
npm install --prefix mobile
npm run typecheck --prefix mobile
npm test --prefix mobile
```

Use the Android build scripts in `mobile/package.json` to produce the release APK. CI artifacts do not replace installation and verification on a physical Android device.

## Release smoke checks

After deployment, verify sign-in, refresh, logout, protected API access, practice creation, answer submission and study-resource links. Test Vercel/Render cookie configuration in a real browser; CI cannot verify provider settings or browser privacy behavior.

NOT VERIFIED by a successful build alone: production environment values, custom domains, cross-site cookie acceptance, live database backups, real-device performance and APK installation.
