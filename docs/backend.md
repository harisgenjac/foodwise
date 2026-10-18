# Backend (`server/`)

Reference for working on the API. The source of truth is the code; routes and middleware per endpoint are in `src/routes/*.routes.ts`.

## Stack

- Node.js 24, Express 5 (`express@5.2.1`, `@types/express@5`), TypeScript, ESM (`"type": "module"`, `module: nodenext`)
- PostgreSQL through raw `pg` queries (no ORM), migrations with `node-pg-migrate`
- Auth: `jsonwebtoken` + `bcrypt` (10 salt rounds), JWT in an httpOnly cookie, `cookie-parser`, `cors`
- Uploads: `multer` (disk storage). Scheduled work: `node-cron`
- Tests: Jest + supertest (see Testing)

Express 5 notes: `req.query` is a read-only getter (read it, never assign to it), and wildcard routes must be named (`/*splat`). Neither is used today.

## Layout

```
server/
├── src/
│   ├── server.ts            loads dotenv, starts the cron job, listens on PORT (default 3000)
│   ├── app.ts               builds and exports the Express app (no listen, so supertest can import it)
│   ├── config/db.ts         exports the shared pg Pool (DATABASE_URL)
│   ├── controllers/         auth, products, reservations, notifications, favorites, users
│   ├── middleware/          auth.middleware.ts (authenticate, authorize), upload.middleware.ts (multer)
│   ├── routes/              one router per resource, mounted in app.ts
│   ├── jobs/expireProducts.ts
│   ├── types/               auth.ts (AuthUser, Role), express.d.ts (req.user, req.file)
│   ├── utils/validateProduct.ts
│   └── seed.js              demo data (still JS, see Pending)
├── migrations/              node-pg-migrate files (plain JS)
├── tests/                   Jest + supertest (still JS, see Pending)
├── uploads/logos/           uploaded logos (gitignored, `.gitkeep` tracked)
├── dist/                    compiled output (gitignored)
└── tsconfig.json
```

## Scripts and environment

- `npm run dev`: `concurrently "tsc --watch" "node --watch dist/server.js"`. The server runs the compiled `dist/`, so run `npm run build` once on a fresh clone.
- `npm run build` (`tsc`), `npm start` (`node dist/server.js`)
- `npm run migrate up|down`, `npm run migrate create <name>` (uses `.env` through dotenv-cli)
- `npm test` (Jest + supertest, `.env.test`, `--runInBand`). Single file: `npm test -- tests/products.test.js`. Single test: `npm test -- -t "name"`.
- `npm run seed`
- Env: `DATABASE_URL`, `JWT_SECRET`, optional `PORT`, `NODE_ENV`. `.env.test` points at the separate database `food_saver_test_db`.

`tsconfig.json`: `strict`, `module/moduleResolution nodenext`, `target esnext`, `rootDir ./src`, `outDir ./dist`, `types: ["node"]`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `declaration`, `sourceMap`. Migrations and tests live outside `src/`, so they are not compiled.

## Request pipeline (`app.ts`)

Order: `cors({ origin: "http://localhost:5173", credentials: true })` → `express.json()` → `cookieParser()` → `/uploads` static → routers:

`/api/auth`, `/api/products`, `/api/reservations`, `/api/users`, `/api/notifications`, `/api/favorites`

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
| `notifications` | id, user_id → users (CASCADE), message (not null), is_read (default false), created_at | |
| `favorites` | id, restaurant_id → users (CASCADE), store_id → users (CASCADE), created_at | Unique constraint `unique_restaurant_store`. |

- Categories in use: Meat, Fish, Dairy, Vegetables, Fruits, Bakery, Drinks, Frozen Food, Other. Units: kg, g, l, ml, kom, pak.
- `set_updated_at()` trigger function is created in the products migration and reused for reservations. Attach it to any new table that needs `updated_at`.
- Migrations: initial (users), products, reservations, notifications, favorites. Never edit an executed migration. Serial sequences are never reset, so ids keep growing after deletes (normal).

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
| `GET /:id` | authenticated | Includes `business_name`, `city`, `available_quantity`, `days_until_expiry`. Not filtered by expiry. |
| `PUT /:id` | STORE (owner) | 404 if missing, 403 if not owner. |
| `DELETE /:id` | STORE (owner) | Soft delete. 400 if status is Sold/Expired/Removed or active (Pending/Confirmed) reservations exist. |

Register `/mine` before `/:id`. Validation lives in `utils/validateProduct.ts` (`validateProductFields` returns an error string or `null`; required: name, category, original_price, discounted_price, quantity, unit, expiry_date; description optional).

### Reservations `/api/reservations`
| Endpoint | Who | Behavior |
|---|---|---|
| `POST /` | RESTAURANT | Body: product_id, quantity, pickup_date. Transactional (see below). Notifies the store. |
| `GET /mine` | RESTAURANT | Filters: `status`, `name`, `business_name` (ILIKE), `store_id`. `business_name`/`city` are the **store's**. Ordered Pending, Confirmed, Completed, Cancelled, then newest. |
| `GET /store` | STORE | Filters: `status`, `name`, `city`. `business_name`/`city` here are the **restaurant's** (same field names, different meaning). Pending first. |
| `GET /:id` | authenticated | Visible only to the restaurant that made it or the store that owns the product; anyone else gets 404 (existence is not revealed). Joined names are the store's. |
| `PATCH /:id/accept` | STORE (owner) | Pending only. Transaction with `FOR UPDATE`. Sets Confirmed; if confirmed quantity reaches the product quantity, the product becomes `Sold`. Notifies the restaurant. |
| `PATCH /:id/reject` | STORE (owner) | Pending only. Notifies the restaurant. |
| `PATCH /:id/cancel` | RESTAURANT (owner) | Pending only. Notifies the store. |

### Users `/api/users`
- `GET /me`: full profile (explicit column list, never `password_hash`).
- `PUT /me`: updates profile. Optional fields use `COALESCE`, so a field cannot be cleared back to null.
- `POST /me/logo`: `multer` single file field `logo`, stores `/uploads/logos/<userId>-<timestamp>.<ext>` in `logo_url`.
- `GET /stores` (RESTAURANT): store list, filters `city`, `business_name`, ordered by name.
- `GET /stores/:id` (restaurants only; the controller returns 403 for STORE): returns `{ store, products, stats, myReservations }`. `products` are that store's available, unexpired products with computed fields. `stats` = `sold_articles` (count of products with status Sold) and `successful_reservations` (count of Confirmed reservations). `myReservations` = `{ my_reservations_count }` for the calling restaurant (Confirmed + Completed).

### Notifications `/api/notifications`
`GET /` returns `{ notifications, unreadCount }`; `PATCH /:id/read` (scoped by `id` and `user_id`).

### Favorites `/api/favorites` (RESTAURANT)
`POST /` body `{ store_id }` (duplicate returns 409 via Postgres error code `23505`), `DELETE /:storeId` (404 if it was not a favorite), `GET /` (store profiles).

## Business logic worth knowing

- **Available quantity** is computed, never stored: `products.quantity` minus the sum of `Pending` + `Confirmed` reservation quantities. Partial reservations are allowed and the product stays `Available` until accepted reservations cover the full quantity.
- **Stock-safe pattern** (`createReservation`, `acceptReservation`): `pool.connect()`, `BEGIN`, `SELECT ... FOR UPDATE` on the product row, compute, write, `COMMIT`; `ROLLBACK` on any early return or error; `client.release()` in `finally`. Use the same pattern for anything that touches stock.
- **Notifications** are plain inserts made as part of the action: new reservation, accepted, rejected, cancelled by restaurant, cancelled by the expiry job. The first two run inside the transaction. Messages are Bosnian, for example `"Novi zahtjev za rezervaciju: 4kg Piletina"`, `"Vaša rezervacija je prihvaćena."`.
- **Expiry job** (`jobs/expireProducts.ts`, cron `0 0 * * *`, started from `server.ts` only): marks `Available` products past `expiry_date` as `Expired`, cancels their Pending/Confirmed reservations, notifies the restaurants.
- **Soft delete and history:** reservations are never deleted, products are marked `Removed`.
- `Completed` (reservation) and `Reserved` (product) exist in the enums but the current flows only use `Confirmed` and `Sold`. Verify before building on them.

## Conventions

- Controller shape: `try { ... } catch (error) { console.error(...); return res.status(500).json({ error: "..." }) }`, always `return res...`.
- Failures: `{ error }`; successes: `{ message, <entity> }`. 404 for missing, 403 for not-owner, 400 for validation and invalid state.
- Dynamic filters: build the `WHERE` with `values.push(...)` and `$${values.length}`, add `ORDER BY` last. Declare `values` as `(string | number)[]` when it mixes types.
- Priority sorting uses `ORDER BY CASE WHEN status = '...' THEN 0 ... END, created_at DESC`.
- Ownership checks compare the resource owner with `req.user.id` (directly, or through the product's `store_id`).
- User-facing server messages are Bosnian and asserted by tests, for example `"Proizvod uspješno dodan."`, `"Sva polja su obavezna."`, `"Proizvod nije pronađen."`, `"Nemate odgovarajuću rolu za ovu akciju."`, `"Nema dovoljno proizvoda na raspolaganju."`, `"Proizvod ima aktivne rezervacije i ne može biti obrisan."`.

## TypeScript notes

- Local imports use `.js` extensions (nodenext), packages never do.
- `req.body` is `any`; destructure it and annotate with an interface where one exists (`ProductFields`, `RegisterBody`, `LoginBody`). `req.query` values are cast with `as string`. `req.params` values are strings.
- `catch (error)` is `unknown`: use `error instanceof Error && 'code' in error` before reading Postgres codes.
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on: expect `rows[0]` to possibly be undefined.
- `process.env.JWT_SECRET!` is asserted where used.
- Shared types: `types/auth.ts` (`AuthUser`, `Role`), `types/express.d.ts` (augments `Express.Request` with `user?` and `file?`).

## Testing

- Jest + supertest against a real PostgreSQL database (`food_saver_test_db`, schema applied with `npx dotenv -e .env.test -- node-pg-migrate up`). Tests run serially.
- Files: `smoke`, `auth`, `middleware`, `products`, `reservations`. Patterns: `request.agent(app)` keeps the cookie between calls; a fresh agent per test; one agent per user when testing ownership.
- Cleanup in `afterEach`: delete `reservations` first (RESTRICT), then `users` by test emails (`store-a@test.com`, `store-b@test.com`, `restaurant-a@test.com`, `restaurant-b@test.com`, `middleware@test.com`, `test@example.com`); products go with their store through CASCADE. `afterAll` calls `pool.end()`.
- Use obviously nonexistent ids (for example `999999`) for 404 cases.
- Race condition test: two restaurants reserve 8 of 10 at the same time with `Promise.all`; the sorted statuses must equal `[201, 400]`.

## Seed

`npm run seed` deletes all rows (notifications, reservations, products, users, in that order), then inserts 3 stores, 2 restaurants, 5 random products per store with future expiry dates, and a few reservations in different statuses. All demo accounts use password `demo12345`: stores `market.centar@demo.com`, `pekara.dobra@demo.com`, `zeleni.market@demo.com`; restaurants `restoran.ukus@demo.com`, `pizzeria.roma@demo.com`.

## Pending and known limitations

- **Seed and tests are not on the TypeScript layout yet.** They import `../src/app.js`, `../src/config/db.js` and `./config/db.js`, which exist only as `.ts`. Plan: convert `seed.js` to `seed.ts` (script becomes `node dist/seed.js` after a build) and either convert the tests to TS with a TS transform or point them at `dist/`.
- **Deployment:** `sameSite: "strict"` breaks cookie auth when the frontend and backend are on different domains (needs `none` + `secure`, or a shared domain); CORS origin is hard-coded to localhost; logo uploads on local disk are lost on Render restarts (needs cloud storage; Cloudinary is not available in the owner's country, so evaluate alternatives).
- Server messages should become error keys translated on the client.
- `GET /products`: filter `available_quantity > 0` in SQL (`HAVING`) instead of on the client.
- `PUT /users/me`: replace `COALESCE` with a real PATCH that can clear optional fields.
- Product templates ("save as template") are an idea, not started.
