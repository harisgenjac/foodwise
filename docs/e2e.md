# E2E tests (`e2e/`)

Playwright tests that drive the built frontend in Chromium against the real API and a real PostgreSQL database. They are a separate package (`e2e/package.json`) with its own database and seed. They complement the Vitest suites rather than replace them: each test covers one complete user flow across both sides.

## Layout

```
e2e/
├── package.json          @playwright/test, pg, bcryptjs, dotenv, typescript
├── playwright.config.ts  projects, web servers, reporters
├── global-setup.ts       empties the database and seeds it (support/seed.ts)
├── support/
│   ├── accounts.ts       seeded accounts, password, URLs, storageState paths, runId(), uniqueName(prefix)
│   ├── api.ts            API clients and arrange helpers (apiAs, apiLogin, myId, createProduct, cityId, reserve,
│   │                     acceptReservation, completeReservation, createStoreWithoutPlan)
│   ├── ui.ts             UI helpers (toast, dialogWith, loginViaForm, submitLoginForm, changeTemporaryPassword,
│   │                     fillProductForm, searchMarketplace, expectNotInMarketplace, credits)
│   ├── seed.ts           the e2e seed
│   └── dates.ts          sarajevoDate(days) → dd/mm/yyyy (UI), isoDate(days) → yyyy-mm-dd (API), both in Europe/Sarajevo
└── tests/
    ├── auth.setup.ts                  logs the seeded roles in through the API once, saves .auth/<role>.json
    ├── first-login.spec.ts            admin creates a restaurant → temporary password → password change → profile gate → dashboard
    ├── reservation-flow.spec.ts       store publishes → restaurant reserves for tomorrow → store accepts → Pickups → picked up → "Preuzeto" + notification
    ├── reservation-reject.spec.ts     restaurant reserves (−1 credit) → store rejects → "Odbijeno" + notification → credit back, full quantity offered again
    ├── credits-first-product.spec.ts  store without a plan is stopped on Add product → requests a plan → admin approves → notification, 50 credits → publishes (49)
    ├── store-chain.spec.ts            admin creates a company → HQ first login → branch in Breza + plan → admin approves → branch first login (name and city locked) → product → restaurant in Visoko sees "dio <company>"
    ├── nearby-offers.spec.ts          Breza (7 km) and Tuzla (73 km) products → default 10 km shows Breza + "more further away" hint → "Svi gradovi" shows Tuzla → city Tuzla shows it at 5 km
    ├── csv-import.spec.ts             store imports a 3-row CSV → My products, −3 credits → a CSV with an invalid row shows the row error, imports nothing, credits unchanged
    ├── block-store.spec.ts            admin blocks blockStore with a reason → its session ends, login shows the reason → offer hidden → unblock → offer back
    ├── donations.spec.ts              store moves a product's free quantity to donations → shown on "Doniraj hranu", gone from the marketplace → removed and returned to the offer
    └── branch-deactivation.spec.ts    HQ can't deactivate the branch with an accepted pickup → picked up (API) → deactivated: offer hidden, branch login refused → reactivated: offer back
```

Scripts (in `e2e/`): `npm run e2e` (headless), `npm run e2e:ui` (Playwright UI mode), `npm run typecheck`.

## Database and environment

The tests use a separate database, `food_saver_e2e_db`. Any database whose name does not end in `_e2e_db` is refused, because the run migrates it and empties every table: `playwright.config.ts` checks it before the web servers start, and the seed checks again. Configuration lives in `e2e/.env.e2e`. Like every `.env*` file it is never committed. Contents:

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
     - Stores and restaurants with complete profiles (key in `ACCOUNTS` → account):

       | Key | Email | Business | City | Used by |
       |---|---|---|---|---|
       | `store` | `e2e-store@` | E2E Prodavnica | Visoko | shared by most tests |
       | `restaurant` | `e2e-restaurant@` | E2E Restoran | Visoko | shared by most tests |
       | `brezaStore` | `e2e-breza@` | E2E Breza Market | Breza (7 km) | `nearby-offers` |
       | `tuzlaStore` | `e2e-tuzla@` | E2E Tuzla Market | Tuzla (73 km) | `nearby-offers` |
       | `blockStore` | `e2e-block@` | E2E Blokada | Visoko | only `block-store` (blocked there) |
       | `branch` | `e2e-branch@` | E2E Lanac Visoko | Visoko | only `branch-deactivation` (deactivated there) |

     - The company "E2E Lanac": its headquarters login `hq` (`e2e-hq@`, role `COMPANY`, name and phone filled) and the `branch` above.
   - All emails end in `@foodwise.test`. Every seeded account uses the password `E2e-pass-123` (`support/accounts.ts`).
   - Every store and restaurant (the branch too, not the HQ) gets an approved Standard plan (50 credits) for the current credit month: an `APPROVED` request, the subscription and the `PLAN_GRANT`, with auto-renew off. The cities, plans and packages come from the migrations, and every date is relative to today.
3. **`setup` project** (`tests/auth.setup.ts`): logs each seeded role in through `POST /api/auth/login` and saves its cookie to `e2e/.auth/<role>.json`. Tests start from these sessions with `test.use({ storageState: storageState("store") })`, or `browser.newContext({ storageState })` when a test needs two roles. The login form is used only where logging in is part of the flow: `loginViaForm` in `first-login.spec.ts` and `store-chain.spec.ts`, and `submitLoginForm` for the refused logins in `block-store.spec.ts` and `branch-deactivation.spec.ts`.
4. **`chromium` project:** the specs, one worker.

Config:
- Retries: 1 on CI, 0 locally.
- Trace on the first retry; screenshot and video kept only on failure.
- HTML report in `e2e/playwright-report/` and artifacts in `e2e/test-results/` (both gitignored), plus the `github` reporter on CI.
- `timezoneId: Europe/Sarajevo`.

## Writing tests

### Arrange through the API, act through the UI

- Data a test needs but does not test (a product to reserve, a fresh account) is created through the API with the helpers in `support/api.ts`. The behaviour under test is clicked through the UI.
  - `apiAs(role)` is an API client with a seeded role's session; `apiLogin(email, password)` logs any account in.
  - An `APIRequestContext` sends no `Origin` or `Referer`, so the server's origin check lets its writes through. If you ever add an `Origin` header, it must be exactly `http://localhost:4173`.
  - The API takes dates as `yyyy-mm-dd` (`isoDate(days)`); the UI's `DateInput` takes `dd/mm/yyyy` (`sarajevoDate(days)`).
- Keep helpers small and shared (`support/api.ts`, `support/ui.ts`, `uniqueName(prefix)`), not a page-object layer.
- Long flows wrap their parts in `test.step()` with short Bosnian names (e.g. `"Prodavnica odbija zahtjev"`), so the report shows where a test failed.
- Credit balances are asserted through the UI, never the database: `availableCredits(page)` and `expectAvailableCredits(page, n)` read "Dostupno" on the Credits page, and the dialogs show `Ovo troši 1 kredit (preostalo: N)`. Read the starting number at run time; the seeded accounts' balances change with every test.
- A test that needs a state the shared seeded accounts lose after one run creates its own account instead. For example, `credits-first-product.spec.ts` needs a store with no plan and gives it one, so it uses `createStoreWithoutPlan()` (a Visoko store with a complete profile and its password changed) rather than a seeded store. The seed runs once per `playwright test`, so a seeded account like that would fail the CI retry and `--repeat-each`.
- A test that blocks or deactivates an account uses its own seeded account (`blockStore`, `branch`), never the shared store and restaurant, and restores it in `test.afterEach` through the API (unblock, reactivate, and complete the accepted pickup it created), so it ends restored even when it fails. The saved sessions work again after a restore, because the block is checked in the database on every request.
- Products get unique names (`uniqueName(prefix)`), and a marketplace search filters by that name, so products from other tests never interfere. CSV fixtures and expiry dates are built at run time relative to today.

### General

- Wait until a page has loaded its data before typing into a form it fills from the API. `MyProfilePage` overwrites its fields when `GET /users/me` answers, so the test first waits for the read-only Email field to have its value.
- Each test creates its own data with a unique suffix (`runId()`, e.g. product `E2E Mlijeko <id>`, email `e2e-rest-<id>@foodwise.test`). Tests never depend on each other or on order. The shared seeded accounts (`store`, `restaurant`) are never blocked and never get a changed profile or password.
- **Locators:**
  - Use `getByRole`, `getByLabel`, `getByText` and `getByPlaceholder` (the filter inputs have no label) with the Bosnian UI. The language is fixed to `bs`.
  - Scope repeated controls: dialogs by `getByRole('dialog', { name })` (or `dialogWith(page, text)` for the dialogs without an accessible name: the reserve dialog, `SubscribeModal`, `CreditRequestDecisionModal`), pickup cards by `getByRole('article').filter({ has: heading })`, header and sidebar by `locator('header')` / `locator('aside')`.
  - Toasts are `role="status"` (so is the credit banner), so filter by text: `getByRole('status').filter({ hasText })`.
  - Use `exact: true` when a label is a substring of another (`Ime` / `Prezime`, `Nova lozinka` / `Ponovite novu lozinku`).
- **`data-testid` only where roles are ambiguous.** There are three, because these cards are plain `div`s with the same buttons on every card:
  - `product-card` on `DashboardProductCard` (marketplace, dashboard and My products).
  - `reservation-card` on `DashboardReservationCard` (the store's reservations).
  - `donation-card` on `DonationCard` ("Doniraj hranu").
  - Use them as `getByTestId('product-card').filter({ has: getByRole('heading', { name }) })`.
- **Waiting:**
  - Never use `waitForTimeout`. Rely on auto-waiting and web-first assertions (`toBeVisible`, `toHaveURL`, `toHaveCount`).
  - Notifications poll every 50 s, so load the page that shows them (`goto`, `reload`) instead of waiting.
  - The list filters (name search, radius, city) are debounced by 500 ms, and the list keeps the previous results until the new answer arrives. To check that something is absent, wait for the empty state ("Nema rezultata", see `expectNotInMarketplace`). A bare `toHaveCount(0)` can pass before the search has run.
- **Dates:** `DateInput` fields take `dd/mm/yyyy`. Use `sarajevoDate(days)` and press Enter to commit the value. The product form's expiry has shortcut buttons ("Sutra", "Za 3 dana").

## Running locally

Once:
```bash
psql -U postgres -c "CREATE DATABASE food_saver_e2e_db;"
# create e2e/.env.e2e (see above)
npm run install:all          # root: dependencies of the root, server/, client/ and e2e/
cd e2e && npx playwright install chromium
```

Run a single file (the whole suite runs in CI). Check a new test for flakiness with `--repeat-each=3` before pushing:
```bash
cd e2e
npm run e2e -- tests/reservation-flow.spec.ts
npm run e2e -- tests/store-chain.spec.ts --repeat-each=3
npm run e2e:ui                       # UI mode, pick tests interactively
npx playwright show-report           # the last run's HTML report
```

Ports 3100 and 4173 must be free, but the normal dev servers can keep running.

**VS Code:** the Playwright Test for VS Code extension finds `e2e/playwright.config.ts` by itself. The tests appear in the Testing view, and a test run from there also runs the `setup` project it depends on. Chromium must be installed once (`npx playwright install chromium` in `e2e/`). The extension loads the config from the workspace root, so the config resolves `.env.e2e` and the `.auth/` sessions from its own folder (`import.meta.url`), never from the working directory. Keep it that way for any new file path. Each run builds both sides and reseeds the database, so expect about 15–20 s before the first test starts.

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
