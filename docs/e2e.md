# E2E tests (`e2e/`)

Playwright tests that drive the built frontend in Chromium against the real API and a real PostgreSQL database. They are a separate package (`e2e/package.json`) with its own database and seed. They complement the Vitest suites rather than replace them: each test covers one complete user flow across both sides.

## Layout

```
e2e/
├── package.json          @playwright/test, pg, bcryptjs, dotenv, typescript
├── playwright.config.ts  projects, web servers, reporters
├── global-setup.ts       empties the database and seeds it (support/seed.ts)
├── support/
│   ├── accounts.ts       seeded accounts, password, URLs, storageState paths, runId()
│   ├── seed.ts           the e2e seed
│   └── dates.ts          sarajevoDate(days) → dd/mm/yyyy in Europe/Sarajevo
└── tests/
    ├── auth.setup.ts            logs the seeded roles in through the API once, saves .auth/<role>.json
    ├── first-login.spec.ts      admin creates a restaurant → temporary password → password change → profile gate → dashboard
    └── reservation-flow.spec.ts store publishes → restaurant reserves for tomorrow → store accepts → Pickups → picked up → "Preuzeto" + notification
```

Scripts (in `e2e/`): `npm run e2e` (headless), `npm run e2e:ui` (Playwright UI mode), `npm run typecheck`.

## Database and environment

The tests use a separate database, `food_saver_e2e_db`. The seed refuses any database whose name does not end in `_e2e_db`, because it empties every table. Configuration lives in `e2e/.env.e2e`. Like every `.env*` file it is never committed. Contents:

```
DATABASE_URL=postgres://<user>:<password>@localhost:5432/food_saver_e2e_db
JWT_SECRET=<any test value>
PORT=3100
CLIENT_ORIGIN=http://localhost:4173
TRUST_PROXY=0
DISABLE_RATE_LIMITS=true
```

- `CLIENT_ORIGIN` must be the preview server's origin. The origin check refuses writes from any other origin.
- The frontend and the API both run on `localhost`, so the `sameSite: "strict"` cookie is sent. Don't mix in `127.0.0.1`.
- `DISABLE_RATE_LIMITS=true` turns the server's rate limiters off, as Vitest does with `NODE_ENV=test`. The server logs a warning when it is set. Never set it on a deployment.

## What a run does

1. **Web servers.** Playwright starts these first, before global setup. Both use `reuseExistingServer: false`, so every run builds fresh.
   - **Backend** (`cwd: server/`): `npm run build && npx node-pg-migrate up && node dist/server.js` on port 3100. It gets the `.env.e2e` variables through the environment, and they take precedence over `server/.env`. The migrations run here because global setup runs after the servers start.
   - **Frontend** (`cwd: client/`): `vite build --outDir dist-e2e` with `VITE_API_URL=http://localhost:3100`, then `vite preview` on port 4173. It uses its own output folder, so the normal `dist/` is untouched. Ports 3100 and 4173 don't clash with the dev servers (3000/5173).
2. **Global setup** (`global-setup.ts` → `support/seed.ts`):
   - It truncates every `public` table except `pgmigrations`, `cities`, `plans` and `topup_packages` (`RESTART IDENTITY CASCADE`).
   - It then creates, in one transaction:
     - An admin `e2e-admin@foodwise.test`.
     - A store `e2e-store@foodwise.test` ("E2E Prodavnica") and a restaurant `e2e-restaurant@foodwise.test` ("E2E Restoran"). Both are in Visoko with complete profiles.
   - Every seeded account uses the password `E2e-pass-123` (`support/accounts.ts`).
   - The store and the restaurant each get an approved Standard plan for the current credit month: an `APPROVED` request, the subscription and the `PLAN_GRANT`, with auto-renew off. The cities, plans and packages come from the migrations, and every date is relative to today.
3. **`setup` project** (`tests/auth.setup.ts`): logs each seeded role in through `POST /api/auth/login` and saves its cookie to `e2e/.auth/<role>.json`. Tests start from these sessions with `test.use({ storageState: storageState("store") })`, or `browser.newContext({ storageState })` when a test needs two roles. Only `first-login.spec.ts` uses the login form.
4. **`chromium` project:** the specs, one worker.

Config:
- Retries: 1 on CI, 0 locally.
- Trace on the first retry; screenshot and video kept only on failure.
- HTML report in `e2e/playwright-report/` and artifacts in `e2e/test-results/` (both gitignored), plus the `github` reporter on CI.
- `timezoneId: Europe/Sarajevo`.

## Writing tests

- Each test creates its own data with a unique suffix (`runId()`, e.g. product `E2E Mlijeko <id>`, email `e2e-rest-<id>@foodwise.test`). Tests never depend on each other or on order. The seeded accounts are shared, so never change their profile or password.
- **Locators:**
  - Use `getByRole`, `getByLabel`, `getByText` and `getByPlaceholder` (the filter inputs have no label) with the Bosnian UI. The language is fixed to `bs`.
  - Scope repeated controls: dialogs by `getByRole('dialog', { name })`, pickup cards by `getByRole('article').filter({ has: heading })`, header and sidebar by `locator('header')` / `locator('aside')`.
  - Toasts are `role="status"` (so is the credit banner), so filter by text: `getByRole('status').filter({ hasText })`.
  - Use `exact: true` when a label is a substring of another (`Ime` / `Prezime`, `Nova lozinka` / `Ponovite novu lozinku`).
- **`data-testid` only where roles are ambiguous.** There are two, because these cards are plain `div`s with the same buttons on every card:
  - `product-card` on `DashboardProductCard` (marketplace and dashboard).
  - `reservation-card` on `DashboardReservationCard` (the store's reservations).
  - Use them as `getByTestId('product-card').filter({ has: getByRole('heading', { name }) })`.
- **Waiting:**
  - Never use `waitForTimeout`. Rely on auto-waiting and web-first assertions (`toBeVisible`, `toHaveURL`, `toHaveCount`).
  - Notifications poll every 50 s, so load the page that shows them (`goto`, `reload`) instead of waiting.
- **Dates:** `DateInput` fields take `dd/mm/yyyy`. Use `sarajevoDate(days)` and press Enter to commit the value. The product form's expiry has shortcut buttons ("Sutra", "Za 3 dana").

## Running locally

Once:
```bash
psql -U postgres -c "CREATE DATABASE food_saver_e2e_db;"
# create e2e/.env.e2e (see above)
cd e2e && npm install && npx playwright install chromium
```

Run a single file (the whole suite runs in CI):
```bash
cd e2e
npm run e2e -- tests/reservation-flow.spec.ts
npm run e2e:ui                       # UI mode, pick tests interactively
npx playwright show-report           # the last run's HTML report
```

Ports 3100 and 4173 must be free, but the normal dev servers can keep running.

## CI and failed runs

The `E2E` job in `.github/workflows/ci.yml` runs when `server/`, `client/` or `e2e/` changed (or the workflow or root package files):
- It runs a `postgres:15` service with `food_saver_e2e_db` and writes `.env.e2e` with test-only values.
- It runs `npm ci` in all three packages and caches the Chromium download (`~/.cache/ms-playwright`, keyed by the Playwright version). It installs Chromium with `--with-deps` on a cache miss, and only the system dependencies on a hit.
- It runs `npm run typecheck` and `npm run e2e` in `e2e/`.

On failure, it uploads the `e2e-report` artifact (`playwright-report/` and `test-results/`, kept 14 days). To inspect it:

```bash
gh run download <run-id> -n e2e-report -D e2e-report
npx playwright show-report e2e-report/playwright-report
npx playwright show-trace e2e-report/test-results/<test-folder>/trace.zip
```

Run these from `e2e/` so the local Playwright is used. The trace is recorded on the retry (`on-first-retry`), so it sits in the `-retry1` folder. A trace can also be dropped onto https://trace.playwright.dev.
