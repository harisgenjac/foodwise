# Backend (`server/`)

Reference for working on the API. The source of truth is the code; routes and middleware per endpoint are in `src/routes/*.routes.ts`.

## Stack

- Node.js 24, Express 5 (`express@5.2.1`, `@types/express@5`), TypeScript, ESM (`"type": "module"`, `module: nodenext`)
- PostgreSQL through raw `pg` queries (no ORM), migrations with `node-pg-migrate`
- Auth: `jsonwebtoken` + `bcrypt` (10 salt rounds), JWT in an httpOnly cookie, `cookie-parser`, `cors`
- Uploads: `multer` (disk storage). Scheduled work: `node-cron`
- Tests: Vitest + supertest (see Testing)

Express 5 notes: `req.query` is a read-only getter (read it, never assign to it), and wildcard routes must be named (`/*splat`). Neither is used today.

## Layout

```
server/
├── src/
│   ├── server.ts            loads dotenv, starts the cron jobs, listens on PORT (default 3000)
│   ├── app.ts               builds and exports the Express app (no listen, so supertest can import it)
│   ├── config/db.ts         exports the shared pg Pool (DATABASE_URL)
│   ├── controllers/         auth, products, reservations, notifications, favorites, users, productTemplates
│   ├── middleware/          auth.middleware.ts (authenticate, authorize), upload.middleware.ts (multer, `uploadLogoFile`)
│   ├── routes/              one router per resource, mounted in app.ts
│   ├── jobs/                expireProducts.ts, notificationReminders.ts
│   ├── types/               auth.ts (AuthUser, Role), express.d.ts (req.user, req.file)
│   ├── utils/               validateProduct.ts, notifications.ts (createNotification, NotificationType)
│   └── scripts/             seed.ts (demo reset), seedFakeData.ts (adds data)
├── migrations/              node-pg-migrate files (plain JS)
├── tests/                   Vitest + supertest, TypeScript (setup.ts, helpers.ts, *.test.ts)
├── uploads/logos/           uploaded logos (gitignored, `.gitkeep` tracked)
├── dist/                    compiled output (gitignored)
├── tsconfig.json            build config (src only)
├── tsconfig.test.json       type-check config for src + tests (npm run typecheck)
└── vitest.config.ts
```

## Scripts and environment

- `npm run dev`: `concurrently "tsc --watch" "node --watch dist/server.js"`. The server runs the compiled `dist/`, so run `npm run build` once on a fresh clone.
- `npm run build` (`tsc`), `npm start` (`node dist/server.js`)
- `npm run migrate up|down`, `npm run migrate create <name>` (uses `.env` through dotenv-cli)
- `npm test` (Vitest + supertest, `.env.test`, files run one at a time). Single file: `npm test -- tests/products.test.ts`. Single test: `npm test -- -t "name"`. Watch mode: `npm run test:watch`.
- `npm run typecheck`: `tsc --noEmit -p tsconfig.test.json` (source and tests).
- `npm run seed` (destructive reset, built then run from `dist/`, see Seed), `npm run seed:fake` (adds data, never touches users)
- Env: `DATABASE_URL`, `JWT_SECRET`, optional `PORT`, `NODE_ENV`. `.env.test` points at the separate database `food_saver_test_db`.

`tsconfig.json`: `strict`, `module/moduleResolution nodenext`, `target esnext`, `rootDir ./src`, `outDir ./dist`, `types: ["node"]`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `declaration`, `sourceMap`, `include: ["src"]`. Migrations and tests live outside `src/`, so the build never emits them. `tsconfig.test.json` extends it with `rootDir: "."`, `noEmit`, `types: ["node", "vitest/globals"]` and includes `tests/`, so the tests are type-checked with the same strict options.

## Request pipeline (`app.ts`)

Order: `cors({ origin: "http://localhost:5173", credentials: true })` → `express.json()` → `req.body ??= {}` (Express 5 leaves it undefined for requests without a body; controllers destructure it) → `cookieParser()` → routers → `/uploads` static → JSON 404 for unknown `/api/*` paths (`"Ruta nije pronađena."`) → error handler (malformed JSON body: 400 `"Neispravan format zahtjeva."`; anything else is logged and answers 500 `"Došlo je do greške na serveru."`).

Routers: `/api/auth`, `/api/products`, `/api/reservations`, `/api/users`, `/api/notifications`, `/api/favorites`, `/api/product-templates`

Routes chain `authenticate` → `authorize('<ROLE>')` (single role) → controller.

## Auth

- `register`: requires first_name, last_name, email, password, role (`STORE` | `RESTAURANT`); rejects duplicate email; stores a bcrypt hash.
- `login`: bcrypt compare, `jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "7d" })`, sets cookie `token` (`httpOnly`, `secure` only when `NODE_ENV === "production"`, `sameSite: "strict"`, 7-day `maxAge`). Returns `{ message, user: { id, first_name, last_name, email, role } }`. Wrong email and wrong password return the same message.
- `logout`: `clearCookie` with the same options. `GET /auth/me` returns only the token payload (`{ id, role }`); the client uses `GET /users/me` for full data.
- `authenticate`: reads `req.cookies.token`, `jwt.verify`, rejects non-object payloads, sets `req.user` (`AuthUser = JwtPayload & { id: number; role: Role }`). Failures are 401.
- `authorize(role)`: 403 with "Nemate odgovarajuću rolu za ovu akciju." when the role differs.
- Controllers read `req.user!.id` (non-null assertion is safe because `authenticate` runs first).

## Database

Enum types: user role (`STORE`, `RESTAURANT`), product status (`Available`, `Reserved`, `Sold`, `Expired`, `Removed`), reservation status (`Pending`, `Confirmed`, `Completed`, `Cancelled`). Category and unit are stored as codes in VARCHAR columns; labels are a frontend concern.

| Table | Columns | Notes |
|---|---|---|
| `users` | id, first_name, last_name, email (unique), password_hash, role, business_name, logo_url, address, city, opening_hours, pickup_hours, description, phone, created_at | One table for both roles. `business_name`, `city`, `phone` are required on profile update. |
| `products` | id, store_id → users (CASCADE), name, description, category, original_price, discounted_price, quantity, unit, expiry_date, status, created_at, updated_at | Soft delete via `status = 'Removed'`. `updated_at` set by trigger. |
| `reservations` | id, product_id → products (RESTRICT), restaurant_id → users (RESTRICT), quantity, status, pickup_date, created_at, updated_at | RESTRICT keeps history, so a user with reservations cannot be deleted. |
| `notifications` | id, user_id → users (CASCADE), type (varchar, nullable), message (not null), is_read (default false), created_at, reservation_id → reservations (SET NULL), product_id → products (SET NULL) | Index on (user_id, created_at). Rows from before `type` existed have `type`, `reservation_id` and `product_id` null and a Bosnian `message`. |
| `favorites` | id, restaurant_id → users (CASCADE), store_id → users (CASCADE), created_at | Unique constraint `unique_restaurant_store`. |
| `product_templates` | id, store_id → users (CASCADE), name, description, category, unit, original_price, discounted_price, quantity (decimals nullable), shelf_life_days (integer, nullable), created_at, updated_at | Unique constraint `unique_store_template_name` on (store_id, name). `updated_at` set by the shared `set_updated_at` trigger. |

- Categories in use: Meat, Fish, Dairy, Vegetables, Fruits, Bakery, Drinks, Frozen Food, Other. Units: kg, g, l, ml, kom, pak.
- `set_updated_at()` trigger function is created in the products migration and reused for reservations. Attach it to any new table that needs `updated_at`.
- Migrations: initial (users), products, reservations, notifications, favorites, product templates, notification links (`type`, `reservation_id`, `product_id`). Never edit an executed migration. Serial sequences are never reset, so ids keep growing after deletes (normal).

## API reference

Roles shown are the intent; confirm exact middleware in `src/routes/`.

### Auth `/api/auth`
`POST /register`, `POST /login`, `POST /logout`, `GET /me` (authenticated)

### Products `/api/products`
| Endpoint | Who | Behavior |
|---|---|---|
| `POST /` | STORE | Create. `store_id` always comes from `req.user`, never from the body. |
| `GET /` | authenticated (marketplace for restaurants) | Only `Available` and not expired. Filters: `category`, `maxPrice`, `expiryWithinDays`, `name` (ILIKE). Joins `users` and returns `business_name`, `city`, computed `available_quantity` and `days_until_expiry`. Newest first. |
| `GET /mine` | STORE | Own products except `Removed`. Filters: `category`, `status`, `name`, `expiryWithinDays`. Ordered Available, Sold, Expired, then newest. |
| `GET /:id` | authenticated | Includes `business_name`, `city`, `store_address`, `store_phone`, `store_pickup_hours`, `available_quantity`, `days_until_expiry`. Not filtered by expiry. |
| `PUT /:id` | STORE (owner) | 404 if missing, 403 if not owner. |
| `DELETE /:id` | STORE (owner) | Soft delete. 400 if status is Sold/Expired/Removed or active (Pending/Confirmed) reservations exist. |

Register `/mine` before `/:id`. Validation lives in `utils/validateProduct.ts` (`validateProductFields` returns an error string or `null`) and is used by create and update:
- required: name, category, original_price, discounted_price, quantity, unit, expiry_date (description optional) → `"Sva polja su obavezna."`
- prices and quantity must be numbers above 0 → `"Cijene i količina moraju biti pozitivni brojevi."`
- discounted_price may not exceed original_price → `"Snižena cijena ne može biti veća od originalne."`
- expiry_date must parse as a date → `"Datum isteka nije ispravan."`

### Reservations `/api/reservations`

The list and detail responses join the product and include `product_name`, `description`, `original_price`, `discounted_price`, `category` and `unit`.

| Endpoint | Who | Behavior |
|---|---|---|
| `POST /` | RESTAURANT | Body: product_id, quantity, pickup_date (400 `"Sva polja su obavezna."`; quantity must be a number above 0, `"Količina mora biti veća od nule."`; pickup_date must parse, `"Datum preuzimanja nije ispravan."`). Transactional (see below). 400 `"Proizvod više nije dostupan za rezervaciju."` if the product is not `Available` or is past `expiry_date`. Notifies the store. |
| `GET /mine` | RESTAURANT | Filters: `status`, `name`, `business_name` (ILIKE), `store_id`. `business_name`/`city` are the **store's**. Ordered Pending, Confirmed, Completed, Cancelled, then newest. |
| `GET /store` | STORE | Filters: `status`, `name`, `city`. `business_name`/`city` here are the **restaurant's** (same field names, different meaning). Pending first. |
| `GET /:id` | authenticated | Visible only to the restaurant that made it or the store that owns the product; anyone else gets 404 (existence is not revealed). `business_name`/`city` are the store's; it also returns both parties: `product_id`, `store_id`, `store_address`, `store_phone`, `store_pickup_hours`, `restaurant_name`, `restaurant_city`, `restaurant_address`, `restaurant_phone` (`users` joined twice, aliased `stores` and `restaurants`). |
| `PATCH /:id/accept` | STORE (owner) | Pending only. Transaction with `FOR UPDATE`. 400 if the product is past `expiry_date`. Sets Confirmed; if confirmed quantity reaches the product quantity, the product becomes `Sold`. Notifies the restaurant. |
| `PATCH /:id/reject` | STORE (owner) | Pending only. Notifies the restaurant. |
| `PATCH /:id/cancel` | RESTAURANT (owner) | Pending only. Notifies the store. |

### Users `/api/users`
- `GET /me`: full profile (explicit column list, never `password_hash`).
- `PUT /me`: updates profile. Optional fields use `COALESCE`, so a field cannot be cleared back to null.
- `POST /me/logo`: `uploadLogoFile` (multer, single file field `logo`, JPEG/PNG/WEBP, max 5MB) stores `/uploads/logos/<userId>-<timestamp>.<ext>` in `logo_url`. Rejected uploads answer 400 JSON: `"Dozvoljene su samo JPEG, PNG i WEBP slike."`, `"Slika može imati najviše 5MB."`; no file: `"Slika nije poslana."`.
- `GET /stores` (RESTAURANT): store list, filters `city`, `business_name`, ordered by name. Each store has `active_products` (COUNT, a string): its `Available` products with `expiry_date >= CURRENT_DATE`.
- `GET /stores/:id` (restaurants only; the controller returns 403 for STORE): returns `{ store, products, stats, myReservations }`. `products` are that store's available, unexpired products with computed fields. `stats` = `sold_articles` (count of products with status Sold) and `successful_reservations` (count of Confirmed reservations). `myReservations` = `{ my_reservations_count }` for the calling restaurant (Confirmed + Completed).

### Notifications `/api/notifications`
All routes are scoped to the caller (`user_id`); another user's notification is a 404, never a 403.
- `GET /`: `{ notifications, unreadCount }`. The 50 newest (`ORDER BY created_at DESC, id DESC`), each with `type`, `message`, `is_read`, `created_at`, `reservation_id`, `product_id` and, through LEFT JOINs, `product_name`, `unit` and the reservation's `quantity` (null when there is no link). `unreadCount` is a separate `COUNT(*)` over all of the user's notifications, so it is not capped by the limit.
- `PATCH /read-all`: `{ message: "Sve notifikacije su označene kao pročitane." }`.
- `PATCH /:id/read`: `{ message: "Notifikacija označena kao pročitana." }`; 404 `"Notifikacija nije pronađena."`.
- `DELETE /read`: deletes the caller's read notifications → `{ message: "Pročitane notifikacije su obrisane.", deleted }`.
- `DELETE /:id`: `{ message: "Notifikacija je obrisana." }`; 404 `"Notifikacija nije pronađena."`.

The static paths (`/read-all`, `/read`) are registered before the `/:id` ones.

### Favorites `/api/favorites` (RESTAURANT)
`POST /` body `{ store_id }`: 400 `"ID prodavnice je obavezan."` without it, 404 `"Prodavnica nije pronađena."` unless it is an existing STORE user, 409 `"Prodavnica je već dodana u omiljene."` for a duplicate (Postgres error code `23505`). `DELETE /:storeId` (404 if it was not a favorite), `GET /` (store profiles, no email).

### Product templates `/api/product-templates` (STORE)
Saved product presets a store reuses on the add-product form. Private to the store.
- `GET /`: the caller's templates, newest `updated_at` first → `{ templates }`.
- `POST /`: body `name`, `category`, `unit` (required, else 400 `"Naziv, kategorija i jedinica mjere su obavezni."`), optional `description`, `original_price`, `discounted_price`, `quantity`, `shelf_life_days` (empty strings become NULL). Upsert on `(store_id, name)`: saving an existing name replaces that template's other fields. 201 `{ message: "Predložak uspješno sačuvan.", template }`.
- `DELETE /:id`: 404 `"Predložak nije pronađen."`, 403 `"Nemate ovlasti za brisanje ovog predloška."` for another store's template, 200 `{ message: "Predložak uspješno obrisan." }`.

## Business logic worth knowing

- **Available quantity** is computed, never stored: `products.quantity` minus the sum of `Pending` + `Confirmed` reservation quantities. Partial reservations are allowed and the product stays `Available` until accepted reservations cover the full quantity.
- **Stock-safe pattern** (`createReservation`, `acceptReservation`): `pool.connect()`, `BEGIN`, `SELECT ... FOR UPDATE` on the product row, compute, write, `COMMIT`; `ROLLBACK` on any early return or error; `client.release()` in `finally`. Use the same pattern for anything that touches stock.
- **Notifications** are written with `createNotification(db, { userId, type, message, reservationId?, productId? })` from `utils/notifications.ts` as part of the action; `db` is the pool or the transaction client, so inserts inside a transaction commit or roll back with it. The client translates each one from `type` plus the joined product data; `message` is an **English fallback** (the one exception to "server messages are Bosnian"), for example `"New reservation request: 4kg Chicken"`. Types:

  | type | Recipient | Trigger | Links |
  |---|---|---|---|
  | `RESERVATION_CREATED` | store | `POST /reservations` (in the transaction) | reservation, product |
  | `RESERVATION_ACCEPTED` | restaurant | accept (in the transaction) | reservation, product |
  | `RESERVATION_REJECTED` | restaurant | reject | reservation, product |
  | `RESERVATION_CANCELLED` | store | cancel by the restaurant | reservation, product |
  | `PRODUCT_SOLD_OUT` | store | accept that makes the product `Sold` (in the transaction) | product |
  | `PRODUCT_EXPIRED` | store | expiry job, per expired product | product |
  | `RESERVATION_EXPIRED` | restaurant | expiry job, per cancelled reservation | reservation, product |
  | `PRODUCT_EXPIRING_SOON` | store | reminder job: `Available` product with `expiry_date = CURRENT_DATE + 1` and at least one Pending reservation | product |
  | `PICKUP_TODAY` | restaurant | reminder job: `Confirmed` reservation with `pickup_date::date = CURRENT_DATE` | reservation, product |

  Adding a type means updating `NotificationType` on both sides, the `notifications.types` keys in both locale files and `NOTIFICATION_META` on the client.
- **Expiry job** (`jobs/expireProducts.ts`, started from `server.ts` only): `expireProducts()` marks `Available` products past `expiry_date` as `Expired`, cancels their Pending/Confirmed reservations and notifies the stores and the restaurants, all in one transaction. `startExpirationJob()` runs it once at startup (to catch up on midnights missed while the server was down) and then on cron `0 0 * * *`. Expiry checks in SQL use `expiry_date < CURRENT_DATE`, so a product is still valid on its expiry day.
- **Reminder job** (`jobs/notificationReminders.ts`, started from `server.ts` only): `sendReminders()` inserts `PRODUCT_EXPIRING_SOON` and `PICKUP_TODAY` with `INSERT ... SELECT ... WHERE NOT EXISTS` (same type for the same product or reservation), so each reminder is sent once no matter how often it runs; it returns `{ expiringSoon, pickupToday }` counts. `startReminderJob()` runs it at startup and on cron `0 7 * * *`.
- **Soft delete and history:** reservations are never deleted, products are marked `Removed`.
- `Completed` (reservation) and `Reserved` (product) exist in the enums but the current flows only use `Confirmed` and `Sold`. Verify before building on them.

## Conventions

- Controller shape: `try { ... } catch (error) { console.error(...); return res.status(500).json({ error: "..." }) }`, always `return res...`.
- Failures: `{ error }`; successes: `{ message, <entity> }`. 404 for missing, 403 for not-owner, 400 for validation and invalid state.
- Dynamic filters: build the `WHERE` with `values.push(...)` and `$${values.length}`, add `ORDER BY` last. Declare `values` as `(string | number)[]` when it mixes types.
- Priority sorting uses `ORDER BY CASE WHEN status = '...' THEN 0 ... END, created_at DESC`.
- Ownership checks compare the resource owner with `req.user.id` (directly, or through the product's `store_id`).
- User-facing server messages are Bosnian and asserted by tests (exception: `notifications.message` is an English fallback, the client translates by `type`), for example `"Proizvod uspješno dodan."`, `"Sva polja su obavezna."`, `"Proizvod nije pronađen."`, `"Nemate odgovarajuću rolu za ovu akciju."`, `"Nema dovoljno proizvoda na raspolaganju."`, `"Proizvod ima aktivne rezervacije i ne može biti obrisan."`.

## TypeScript notes

- Local imports use `.js` extensions (nodenext), packages never do.
- `req.body` is `any`; destructure it and annotate with an interface where one exists (`ProductFields`, `RegisterBody`, `LoginBody`). `req.query` values are cast with `as string`. `req.params` values are strings.
- `catch (error)` is `unknown`: use `error instanceof Error && 'code' in error` before reading Postgres codes.
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on: expect `rows[0]` to possibly be undefined.
- `process.env.JWT_SECRET!` is asserted where used.
- Shared types: `types/auth.ts` (`AuthUser`, `Role`), `types/express.d.ts` (augments `Express.Request` with `user?` and `file?`).

## Testing

- Vitest + supertest against a real PostgreSQL database (`food_saver_test_db`, schema applied with `npx dotenv -e .env.test -- node-pg-migrate up`). Tests are TypeScript and import the `.ts` sources directly (Vitest resolves the `.js` import paths), so no build is needed.
- `vitest.config.ts`: `globals: true` (`describe`/`it`/`expect`/`vi` without imports), `fileParallelism: false` because every file shares the one test database, `setupFiles: ["tests/setup.ts"]`. Each file runs in its own module graph with its own pool; `setup.ts` closes it in `afterAll`.
- `tests/helpers.ts`:
  - `registerAndLogin(email, role)` returns a `request.agent(app)` holding the login cookie (one agent per user when testing ownership).
  - `createProduct(agent, overrides)` and `reserve(agent, productId, quantity)` throw if the API refuses, so setup failures are obvious. Also `productPayload()` and `userId(email)`.
  - `futureDate(days)` / `futurePickup(days)` build dates from the local date, so tests never go stale and agree with `CURRENT_DATE` around midnight.
  - `cleanupUsers(emails)` deletes the users' reservations (RESTRICT; both their own and those on their products), then the users, which cascades to products, notifications, favorites and templates.
- Each file uses its own email prefix (`products-store-a@test.com`, ...) and calls `cleanupUsers` in `afterEach`.
- Files:
  - `app`: 401, JSON 404, malformed JSON, missing body, `/uploads` static
  - `auth`, `middleware` (missing, malformed, foreign-secret and expired tokens; both roles)
  - `validateProduct` (unit), `products` (all filters, validation, ownership, delete states)
  - `reservations`: create validation, race condition, `/mine` and `/store` with filters, accept/reject/cancel ownership, state and expiry rules, quantity freed again
  - `users` (profile, store list and details, logo upload incl. wrong type and size), `favorites`, `productTemplates`
  - `notifications`: every type and link, the routes, and the expiry and reminder jobs called directly, including what they must skip
  - `jobs`: cron expressions and error logging, with `node-cron` and the db mocked
- Rows the API cannot create (past expiry dates, chosen statuses) are inserted with `pool.query`. Use obviously nonexistent ids (`999999`) for 404 cases.
- Race condition test: two restaurants reserve 8 of 10 at the same time with `Promise.all`; the sorted statuses must equal `[201, 400]`.

## Seed

`npm run seed` (`src/scripts/seed.ts`, built then run from `dist/`) runs in one transaction: it deletes all reservations and users (which cascades to products, notifications, favorites and templates), then inserts 3 stores, 2 restaurants, 5 random products per store with future expiry dates, and a few reservations in different statuses. All demo accounts use password `demo12345`: stores `market.centar@demo.com`, `pekara.dobra@demo.com`, `zeleni.market@demo.com`; restaurants `restoran.ukus@demo.com`, `pizzeria.roma@demo.com`.

`npm run seed:fake` (`src/scripts/seedFakeData.ts`, built then run from `dist/`) adds data on top of what exists and never creates, changes or deletes users. For every existing STORE it inserts random products from a template list (all categories, prices with a 30-60% discount, expiry today to 14 days out). For every existing RESTAURANT it inserts reservations on those new products with weighted statuses (Pending, Confirmed, Completed, Cancelled); Pending + Confirmed quantities never exceed a product's quantity, Completed pickups are in the past, and it writes the same notifications the app sends for new and accepted reservations (`RESERVATION_CREATED`, `RESERVATION_ACCEPTED`, with links). Everything runs in one transaction. Options: `npm run seed:fake -- --products <per store, default 6> --reservations <per restaurant, default 4>`.

## Pending and known limitations

- **Deployment:** `sameSite: "strict"` breaks cookie auth when the frontend and backend are on different domains (needs `none` + `secure`, or a shared domain); CORS origin is hard-coded to localhost; logo uploads on local disk are lost on Render restarts (needs cloud storage; Cloudinary is not available in the owner's country, so evaluate alternatives).
- Server messages should become error keys translated on the client.
- `GET /products`: filter `available_quantity > 0` in SQL (`HAVING`) instead of on the client.
- `PUT /users/me`: replace `COALESCE` with a real PATCH that can clear optional fields.
- Migrations are still JavaScript. They have already run, so they stay as they are; a new migration can be written in TypeScript once `node-pg-migrate` runs with a TS loader (for example `tsx`).
- Non-numeric ids in the path (`/api/products/abc`) reach Postgres and come back as 500; validate route params if this matters.
- The server has no ESLint setup.
