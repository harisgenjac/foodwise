# Backend (`server/`)

Reference for working on the API. The source of truth is the code; routes and middleware per endpoint are in `src/routes/*.routes.ts`.

## Stack

- Node.js 24, Express 5 (`express@5.2.1`, `@types/express@5`), TypeScript, ESM (`"type": "module"`, `module: nodenext`)
- PostgreSQL through raw `pg` queries (no ORM), migrations with `node-pg-migrate`
- Auth: `jsonwebtoken` + `bcrypt` (10 salt rounds), JWT in an httpOnly cookie, `cookie-parser`, `cors`
- Uploads: `multer` (disk storage for logos, memory storage for CSV imports), CSV parsing with `csv-parse`. Scheduled work: `node-cron`
- Tests: Vitest + supertest (see Testing)

Express 5 notes: `req.query` is a read-only getter (read it, never assign to it), and wildcard routes must be named (`/*splat`). Neither is used today.

## Layout

```
server/
├── src/
│   ├── server.ts            loads dotenv, starts the cron jobs, listens on PORT (default 3000)
│   ├── app.ts               builds and exports the Express app (no listen, so supertest can import it)
│   ├── config/db.ts         exports the shared pg Pool (DATABASE_URL)
│   ├── controllers/         auth, products, reservations, notifications, favorites, users, productTemplates, reports, donations
│   ├── middleware/          auth.middleware.ts (authenticate, authorize), upload.middleware.ts (multer, `uploadLogoFile`, `uploadCsvFile`)
│   ├── routes/              one router per resource, mounted in app.ts
│   ├── jobs/                expireProducts.ts, notificationReminders.ts
│   ├── types/               auth.ts (AuthUser, Role), express.d.ts (req.user, req.file)
│   ├── utils/               validateProduct.ts, validateDonation.ts, productCsv.ts (`parseProductCsv`), notifications.ts (createNotification, NotificationType), csv.ts (`toCsv`), reportLabels.ts, params.ts, dates.ts, httpError.ts
│   └── scripts/             seed.ts (demo reset), seedFakeData.ts (adds data), fakeData.ts (shared generator)
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
- `npm run seed` (destructive reset, see Seed), `npm run seed:fake` (adds data, never touches users); both build first and run from `dist/`.
- Env: `DATABASE_URL`, `JWT_SECRET`, optional `PORT`, `NODE_ENV`, `CLIENT_ORIGIN` (CORS origin, default `http://localhost:5173`), `APP_TIMEZONE` (business time zone for `CURRENT_DATE` and cron, default `Europe/Sarajevo`). `.env.test` points at the separate database `food_saver_test_db`.

`tsconfig.json`: `strict`, `module/moduleResolution nodenext`, `target esnext`, `rootDir ./src`, `outDir ./dist`, `types: ["node"]`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `declaration`, `sourceMap`, `include: ["src"]`. Migrations and tests live outside `src/`, so the build never emits them. `tsconfig.test.json` extends it with `rootDir: "."`, `noEmit`, `types: ["node", "vitest/globals"]` and includes `tests/`, so the tests are type-checked with the same strict options.

## Request pipeline (`app.ts`)

Order: `cors({ origin: CLIENT_ORIGIN, credentials: true })` → `express.json()` → `req.body ??= {}` (Express 5 leaves it undefined for requests without a body; controllers destructure it) → `cookieParser()` → routers → `/uploads` static (with `X-Content-Type-Options: nosniff`) → JSON 404 for any unknown path (`"Ruta nije pronađena."`) → error handler (see Business logic).

Routers: `/api/auth`, `/api/products`, `/api/reservations`, `/api/users`, `/api/notifications`, `/api/favorites`, `/api/product-templates`, `/api/reports`, `/api/donations`

Routes chain `authenticate` → `authorize('<ROLE>', ...)` (one or more allowed roles) → controller.

## Auth

- `register`: requires first_name, last_name, email, password, role (`STORE` | `RESTAURANT`); rejects duplicate email; stores a bcrypt hash.
- `login`: bcrypt compare, `jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "7d" })`, sets cookie `token` (`httpOnly`, `secure` only when `NODE_ENV === "production"`, `sameSite: "strict"`, 7-day `maxAge`). Returns `{ message, user: { id, first_name, last_name, email, role } }`. Wrong email and wrong password return the same message.
- `logout`: `clearCookie` with the same options. `GET /auth/me` returns only the token payload (`{ id, role }`); the client uses `GET /users/me` for full data.
- `authenticate`: reads `req.cookies.token`, `jwt.verify`, rejects non-object payloads, sets `req.user` (`AuthUser = JwtPayload & { id: number; role: Role }`). Failures are 401.
- `authorize(...roles)`: 403 with "Nemate odgovarajuću rolu za ovu akciju." when the caller's role is not one of them (`authorize('STORE')`, `authorize('STORE', 'RESTAURANT')`).
- Controllers read `req.user!.id` (non-null assertion is safe because `authenticate` runs first).

## Database

Enum types: user role (`STORE`, `RESTAURANT`), product status (`Available`, `Sold`, `Expired`, `Removed`), reservation status (`Pending`, `Confirmed`, `Completed`, `Rejected`, `Cancelled`). `Rejected` = refused by the store; `Completed` = picked up (set by the store); `Cancelled` = withdrawn by the restaurant, cancelled by the expiry job, or cancelled by the store after a missed pickup. Donation type (`FREE`, `SPONSORED`) and donation status (`Available`, `Expired`, `Removed`; claim and funding statuses come with the recipient roles). Category and unit are stored as codes in VARCHAR columns (validated against fixed lists, see Validation); labels are a frontend concern.

`DATE` columns (`expiry_date`) come back from `pg` as plain `YYYY-MM-DD` strings: `config/db.ts` overrides the default parser, which would turn them into a JS `Date` at local midnight and serialize the previous day in UTC+ time zones. Every pool session also runs with `timezone = APP_TIMEZONE`, so `CURRENT_DATE` is the local business day.

| Table | Columns | Notes |
|---|---|---|
| `users` | id, first_name, last_name, email (stored lowercase; unique index `users_email_lower_unique` on `LOWER(email)`), password_hash, role, business_name, logo_url, address, city, opening_hours, pickup_hours, description, phone, created_at | One table for both roles. `business_name`, `city`, `phone` are required on profile update. |
| `products` | id, store_id → users (CASCADE), name, description, category, original_price, discounted_price, quantity, unit, expiry_date, status, created_at, updated_at | Soft delete via `status = 'Removed'`. `updated_at` set by trigger. |
| `reservations` | id, product_id → products (RESTRICT), restaurant_id → users (RESTRICT), quantity, unit_price (not null), status, pickup_date, picked_up_at (timestamptz, nullable), created_at, updated_at | RESTRICT keeps history, so a user with reservations cannot be deleted. `unit_price` is the product's `discounted_price` at reservation time; later product edits do not change it. `pickup_date` is a `timestamp` without time zone holding the local (`APP_TIMEZONE`) wall-clock time, so `pickup_date::date` compares with `CURRENT_DATE`. `picked_up_at` is set when the store marks the reservation picked up. |
| `notifications` | id, user_id → users (CASCADE), type (varchar, nullable), message (not null), is_read (default false), created_at, reservation_id → reservations (SET NULL), product_id → products (SET NULL) | Index on (user_id, created_at). Rows from before `type` existed have `type`, `reservation_id` and `product_id` null and a Bosnian `message`. |
| `favorites` | id, restaurant_id → users (CASCADE), store_id → users (CASCADE), created_at | Unique constraint `unique_restaurant_store`. |
| `product_templates` | id, store_id → users (CASCADE), name, description, category, unit, original_price, discounted_price, quantity (decimals nullable), shelf_life_days (integer, nullable), created_at, updated_at | Unique constraint `unique_store_template_name` on (store_id, name). `updated_at` set by the shared `set_updated_at` trigger. |
| `donation_offers` | id, donor_id → users (CASCADE; a store or a restaurant), source_product_id → products (SET NULL, set when moved from a product), donation_type, name, description, category, quantity, unit, original_price (value per unit), donation_price (nullable), expiry_date, pickup_from / pickup_until (`time`, nullable), allergens (`text[]`, default `{}`), serving_temperature (nullable), status, created_at, updated_at | Humanitarian module. CHECK `donation_price_matches_type`: `FREE` has no price, `SPONSORED` a price above 0. `updated_at` by `set_updated_at`. Soft delete via `status = 'Removed'`. |

- Categories in use: Meat, Fish, Dairy, Vegetables, Fruits, Bakery, Drinks, Frozen Food, Other. Units: kg, g, l, ml, kom, pak.
- `set_updated_at()` trigger function is created in the products migration and reused for reservations. Attach it to any new table that needs `updated_at`.
- Indexes beyond primary keys and unique constraints: `notifications(user_id, created_at)`, `products(store_id)`, `products(status, expiry_date)`, `reservations(product_id, status)`, `reservations(restaurant_id)`, `reservations(status, pickup_date)`, `users(LOWER(email))`, `donation_offers(donor_id)`, `donation_offers(status, expiry_date)`.
- Migrations: initial (users), products, reservations, notifications, favorites, product templates, notification links (`type`, `reservation_id`, `product_id`), reservation `unit_price` (backfilled from the product's current price), `Rejected` reservation status (runs outside a transaction because `ALTER TYPE ... ADD VALUE` must commit before use; backfills past rejections from their `RESERVATION_REJECTED` notifications), removal of the unused `Reserved` product status (rebuilds the enum), lowercase unique email (fails if two accounts differ only in case), foreign key indexes, reservation `picked_up_at` (backfilled from `updated_at` for existing Completed rows, plus the `(status, pickup_date)` index), donation offers (table, both enums, check constraint, indexes). Never edit an executed migration. Serial sequences are never reset, so ids keep growing after deletes (normal).

## API reference

Roles shown are the intent; confirm exact middleware in `src/routes/`.

### Auth `/api/auth`
`POST /register`, `POST /login`, `POST /logout`, `GET /me` (authenticated)

Emails are trimmed and lowercased on register and login (login matches `LOWER(email)`, so accounts created before this rule still log in). Register also requires a valid email format (`"Email nije ispravan."`) and a password of at least 8 characters (`"Lozinka mora imati najmanje 8 znakova."`); a duplicate, including one that only differs in case, is 400 `"Korisnik s tim emailom već postoji."`. Login without email or password is 400 `"Email i lozinka su obavezni."`.

### Products `/api/products`
| Endpoint | Who | Behavior |
|---|---|---|
| `POST /` | STORE | Create. `store_id` always comes from `req.user`, never from the body. |
| `POST /import` | STORE | Bulk create from a CSV file (multipart field `file`, see CSV import below). 201 `{ message: "Uvezeno proizvoda: N.", products }`. |
| `GET /` | authenticated (marketplace for restaurants) | Only `Available`, not expired and with `available_quantity > 0` (filtered in SQL). Filters: `category`, `maxPrice`, `expiryWithinDays` (0 = expires today, 1 = by tomorrow, ...), `name` (ILIKE). Paging: `limit` (default 24, max 100), `offset`. `sort`: `newest` (default) or `expiry` (closest expiry first). Joins `users` and returns `business_name`, `city`, computed `available_quantity` and `days_until_expiry`. Response `{ products, total }` where `total` counts all matches, not just the page. Invalid numbers or sort → 400 `"Neispravan filter."`. |
| `GET /mine` | STORE | Own products except `Removed`. Filters: `category`, `status` (must be a known status), `name`, `expiryWithinDays`. Ordered Available, Sold, Expired, then newest. |
| `GET /:id` | authenticated | Includes `business_name`, `city`, `store_address`, `store_phone`, `store_pickup_hours`, `available_quantity`, `days_until_expiry`. Not filtered by expiry. |
| `PUT /:id` | STORE (owner) | Transaction with `FOR UPDATE` on the product. 404 if missing, 403 if not owner, 400 `"Samo dostupni proizvodi se mogu mijenjati."` unless `Available`, 400 `"Količina ne može biti manja od već rezervisane količine."` when the new quantity is below Pending + Confirmed + Completed. If Confirmed + Completed then cover the new quantity, the product becomes `Sold` (with `PRODUCT_SOLD_OUT`). |
| `DELETE /:id` | STORE (owner) | Soft delete. 400 if status is Sold/Expired/Removed or active (Pending/Confirmed) reservations exist. |

Register `/mine` before `/:id`.

#### CSV import

- `uploadCsvFile` (multer memory storage, nothing is written to disk) accepts one file in field `file`, at most 1MB (`MAX_CSV_SIZE_MB`), with a `.csv` extension and a MIME type of `text/csv`, `application/csv`, `application/vnd.ms-excel`, `text/plain` or `application/octet-stream` (browsers disagree on the type of a .csv). Otherwise 400 `"Dozvoljeni su samo CSV fajlovi."` / `"Fajl može imati najviše 1MB."`; no file → 400 `"CSV fajl je obavezan."`. Logo and CSV uploads share the `handleUpload` wrapper, which turns multer errors into 400 JSON.
- `utils/productCsv.ts` → `parseProductCsv(buffer)`: columns `name, description, category, original_price, discounted_price, quantity, unit, expiry_date` (`CSV_COLUMNS`; header names are trimmed and lowercased, order does not matter, `description` is optional). The delimiter (`,` or `;`) is read from the header line, so a `;` file can use an unquoted decimal comma. A UTF-8 BOM is skipped and empty lines are ignored. Values are normalized before `validateProductFields`: `2,50` → `2.50`, and the expiry date → `YYYY-MM-DD` from any form Excel writes when it saves a CSV: a time part (`T...`, ` 00:00:00`, ` 12:00 AM`), spaces and a trailing dot are dropped, then `YYYY-M-D` / `YYYY.M.D` / `YYYY/M/D` (year first), `D.M.YYYY` / `D-M-YYYY` (day first, also with a 2-digit year → `20YY`), `A/B/YYYY` (day first, unless some slashed date in the same file only works month first, like `12/25/2026`; then the whole file is read as US `M/D/YYYY`), and a 5-digit Excel serial (days since 1899-12-30). Anything else is left as is, so the validator rejects it. Category and unit are the server codes (`Meat`, `kg`).
- File-level errors (400): `"CSV fajl nije moguće pročitati."` (e.g. an unclosed quote), `"CSV fajl ne sadrži nijedan proizvod."`, `"CSV fajlu nedostaju kolone: ..."`, `"CSV fajl može imati najviše 500 proizvoda."` (`MAX_CSV_ROWS`).
- All or nothing: every row is validated first. If any fails, the response is 400 `{ error: "CSV sadrži neispravne redove.", rowErrors: [{ row, error }] }` (`row` is the line number in the file, header = 1) and nothing is inserted. For an invalid date the row error quotes the raw value: `Datum isteka nije ispravan: "<value>". Koristite format 31.12.2026.` (the plain `POST /` message is unchanged). Otherwise all rows are inserted in one transaction.

### Validation

- `utils/validateProduct.ts`: `validateProductFields` (create and update) returns a Bosnian error string or `null`:
  - required: name, category, original_price, discounted_price, quantity, unit, expiry_date (description optional) → `"Sva polja su obavezna."`
  - category and unit must be in `CATEGORIES` / `UNITS` (keep in sync with `client/src/utils/categories.ts` and `units.ts`) → `"Kategorija nije ispravna."`, `"Jedinica mjere nije ispravna."`
  - prices and quantity must be numbers above 0 → `"Cijene i količina moraju biti pozitivni brojevi."`
  - discounted_price may not exceed original_price → `"Snižena cijena ne može biti veća od originalne."`
  - expiry_date must be a real `YYYY-MM-DD` date → `"Datum isteka nije ispravan."`, and not before today in `APP_TIMEZONE` → `"Datum isteka ne može biti u prošlosti."`
- `validateTemplateFields` applies the category/unit lists and checks optional numbers when they are given.
- `utils/params.ts`: `parseId` (positive integer or `null`), `parseNumber`, `parseNonNegativeInt`. A non-numeric `:id` returns the resource's normal 404 instead of a Postgres cast error.
- `utils/dates.ts`: `APP_TIMEZONE`, `todayInAppTimezone()`, `isValidDate`, `isValidDateTime`.

### Reservations `/api/reservations`

The list and detail responses join the product and include `product_name`, `description`, `original_price`, `category` and `unit`; `discounted_price` is the reservation's own `unit_price` (the price agreed when it was made), not the product's current price.

| Endpoint | Who | Behavior |
|---|---|---|
| `POST /` | RESTAURANT | Body: product_id, quantity, pickup_date (400 `"Sva polja su obavezna."`). Transactional (see below). `quantity` must be a number above 0 (400 `"Količina mora biti veća od nule."`); `pickup_date` must be a date or date-time (400 `"Datum preuzimanja nije ispravan."`) whose day is between today and the product's `expiry_date` (400 `"Datum preuzimanja mora biti između danas i roka trajanja proizvoda."`). 400 `"Proizvod više nije dostupan za rezervaciju."` if the product is not `Available` or is past `expiry_date`. Stores `unit_price`. Notifies the store. |
| `GET /mine` | RESTAURANT | Filters: `status`, `name`, `business_name` (ILIKE), `store_id`. `business_name`/`city` are the **store's**. Ordered Pending, Confirmed, Completed, Rejected, Cancelled, then newest. |
| `GET /store` | STORE | Filters: `status`, `name`, `city`. `business_name`/`city` here are the **restaurant's** (same field names, different meaning). Pending first. Also returns `picked_up_at` and `is_overdue` (Confirmed and `pickup_date::date < CURRENT_DATE`: a pickup is late only once its whole day has passed, not when the time on that day passes). |
| `GET /pickups` | authenticated (both roles) | The pickups page. `scope` is required: `today` = Confirmed with `pickup_date::date <= CURRENT_DATE` (missed pickups from earlier days included), `upcoming` = Confirmed after today, both ordered by `pickup_date` ascending; `completed` = Completed, newest `picked_up_at` first. Optional `name` (product, ILIKE). Ownership by role: a store sees reservations on its products, a restaurant its own. Each row has `is_overdue` (pickup day before today), `days_overdue` (whole days since the pickup date, 0 for today), `picked_up_at`, the product fields and the **other party** as `business_name`, `city`, `party_phone`, `party_address`, `party_pickup_hours` (`users` joined once as `parties`). Unknown scope → 400 `"Neispravan filter."`. |
| `GET /pickups/counts` | authenticated | `{ counts: { today, overdue, upcoming, completed } }` as numbers, same ownership and definitions (`overdue` = Confirmed with the pickup day before today). |
| `GET /:id` | authenticated | Visible only to the restaurant that made it or the store that owns the product; anyone else gets 404 (existence is not revealed). Includes `picked_up_at` and `is_overdue`. `business_name`/`city` are the store's; it also returns both parties: `product_id`, `store_id`, `store_address`, `store_phone`, `store_pickup_hours`, `restaurant_name`, `restaurant_city`, `restaurant_address`, `restaurant_phone` (`users` joined twice, aliased `stores` and `restaurants`). |
| `PATCH /:id/accept` | STORE (owner) | Pending only. Transaction with `FOR UPDATE`. 400 if the product is past `expiry_date`. Sets Confirmed; if confirmed quantity reaches the product quantity, the product becomes `Sold`. Notifies the restaurant. |
| `PATCH /:id/reject` | STORE (owner) | Pending only. Transaction that locks the reservation row (`FOR UPDATE OF reservations`), so it cannot interleave with an accept. Sets `Rejected`. Notifies the restaurant. |
| `PATCH /:id/cancel` | RESTAURANT (owner) | Pending only. Same locking as reject. Sets `Cancelled`. Notifies the store. |
| `PATCH /:id/complete` | STORE (owner) | The food was handed over. Confirmed only (400 `"Samo prihvaćene rezervacije mogu biti označene kao preuzete."`), 403 `"Nemate ovlasti za potvrdu preuzimanja ove rezervacije."`. Locks the reservation row; sets `Completed` and `picked_up_at = NOW()`; notifies the restaurant (`RESERVATION_COMPLETED`). Allowed after the pickup time or the product's expiry too. `{ message: "Rezervacija je označena kao preuzeta." }` |
| `PATCH /:id/cancel-overdue` | STORE (owner) | The restaurant missed its pickup. Only Confirmed with `pickup_date::date < CURRENT_DATE` (the pickup day has passed) (else 400 `"Samo zakašnjela preuzimanja mogu biti otkazana."`), 403 `"Nemate ovlasti za otkazivanje ove rezervacije."`. Locks the reservation, then the product; sets `Cancelled`, so the quantity is free again; a `Sold` product whose expiry date has not passed goes back to `Available` once Confirmed + Completed no longer cover its quantity. Notifies the restaurant (`PICKUP_MISSED`). `{ message: "Zakašnjela rezervacija je otkazana." }` |

Unknown `status` filter values or a non-numeric `store_id` are 400 `"Neispravan filter."`. `/pickups` and `/pickups/counts` are registered before `/:id`.

### Users `/api/users`
- `GET /me`: full profile (explicit column list, never `password_hash`).
- `PUT /me`: updates profile. Optional fields use `COALESCE`, so a field cannot be cleared back to null.
- `POST /me/logo`: `uploadLogoFile` (multer, single file field `logo`, JPEG/PNG/WEBP, max 5MB) stores `/uploads/logos/<userId>-<timestamp>.<ext>` in `logo_url`. The extension comes from the checked MIME type, never from the uploaded file name, and `/uploads` is served with `nosniff`, so an uploaded file can only ever be an image. The previous logo file is deleted. Rejected uploads answer 400 JSON: `"Dozvoljene su samo JPEG, PNG i WEBP slike."`, `"Slika može imati najviše 5MB."`; no file: `"Slika nije poslana."`.
- `GET /stores` (RESTAURANT): store list, filters `city`, `business_name`, ordered by name. Each store has `active_products` (COUNT, a string): its `Available` products with `expiry_date >= CURRENT_DATE`.
- `GET /stores/:id` (restaurants only; the controller returns 403 for STORE): returns `{ store, products, stats, myReservations }`. `products` are that store's available, unexpired products that still have available quantity, with computed fields. `stats` = `sold_articles` (count of products with status Sold) and `successful_reservations` (count of Confirmed + Completed reservations). `myReservations` = `{ my_reservations_count }` for the calling restaurant (Confirmed + Completed).

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
- `POST /`: body `name`, `category`, `unit` (required, else 400 `"Naziv, kategorija i jedinica mjere su obavezni."`; category and unit must be known codes), optional `description`, `original_price`, `discounted_price`, `quantity`, `shelf_life_days` (empty strings become NULL). Upsert on `(store_id, name)`: saving an existing name replaces that template's other fields. 201 `{ message: "Predložak uspješno sačuvan.", template }`.
- `DELETE /:id`: 404 `"Predložak nije pronađen."`, 403 `"Nemate ovlasti za brisanje ovog predloška."` for another store's template, 200 `{ message: "Predložak uspješno obrisan." }`.

### Reports `/api/reports` (both roles)
Downloadable CSV reports. Both cover only **Completed** reservations whose `picked_up_at::date` is between `from` and `to` (local day, the session runs in `APP_TIMEZONE`), with the same ownership as the pickups page (`pickupOwnership`, exported from `reservations.controller.ts`: a store gets reservations on its products, a restaurant its own; `parties` is the other side).
- Query: `from`, `to` (`YYYY-MM-DD`, required, `from <= to`, at most 366 days including both ends; otherwise 400 `{ error: "Neispravan period." }`) and optional `lang` (`en`; anything else means `bs`) for the column headers, category labels, the total label and the file name. Reports are files read outside the app, so they follow the UI language rather than the Bosnian-only rule.
- Success: 200 with `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="<name>-<from>-<to>.csv"` (not the usual JSON). Errors stay JSON; 500 `"Došlo je do greške prilikom izrade izvještaja."`.
- `GET /sales`: one row per reservation, ordered by `picked_up_at`: pickup date, reservation id, product, category label, other party (`business_name`, else first + last name), its city, quantity, unit, `unit_price`, the product's **current** `original_price` (there is no snapshot of it), total (`unit_price × quantity`), savings (`(original_price − unit_price) × quantity`, never negative). Last row: totals of the two money columns (quantities have mixed units). File name `prodaja`/`sales` for a store, `kupovine`/`purchases` for a restaurant.
- `GET /impact`: one row per month (`YYYY-MM`) plus a total row (`GROUPING SETS`, so partners are counted once over the whole period): pickups, distinct partners (restaurants for a store, stores for a restaurant), food in kg (g/1000), l (ml/1000) and pieces (kom + pak) like the dashboard's food-saved card, value and savings in KM. An empty period still has the total row with zeros. File name `uticaj`/`impact`.
- `utils/csv.ts` → `toCsv(headers, rows)`: UTF-8 BOM, `;` delimiter, CRLF, integers as they are and other numbers with two decimals and a decimal comma (`2,50`), so Bosnian Excel splits the columns and reads the numbers; cells with `;`, `"` or a line break are quoted; text starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'` (CSV formula injection: product and business names are user input). `utils/reportLabels.ts` holds the headers and category labels per language.
- Adding a report: a controller function (query + rows), its headers in `reportLabels.ts`, a route, and an entry in the client's `REPORTS` list.

### Donations `/api/donations` (STORE and RESTAURANT)
Donation offers of the humanitarian module. `FREE` = given away; `SPONSORED` = given at `donation_price`, which a third party will pay. Until the recipient roles exist, a donation is visible only to its donor (`donor_id = req.user.id`).
- `POST /`: create; `donor_id` from `req.user`. 201 `{ message: "Donacija uspješno objavljena.", donation }`.
- `GET /mine`: own donations except `Removed`, `Available` first, then newest. Filters `type`, `status` (`Available`/`Expired`), `name` (ILIKE); anything else → 400 `"Neispravan filter."`. `{ donations }`, each with `days_until_expiry`.
- `GET /:id`: own and not removed, else 404 `"Donacija nije pronađena."`.
- `PUT /:id`: same body as create. 404, 403 `"Nemate ovlasti za izmjenu ove donacije."`, 400 `"Samo aktivne donacije se mogu mijenjati."` unless `Available`. 200 `{ message: "Donacija uspješno ažurirana.", donation }`.
- `DELETE /:id`: soft delete (`Removed`), any status. 404, 403 `"Nemate ovlasti za brisanje ove donacije."`, 200 `{ message: "Donacija je obrisana." }`.
- `POST /from-product/:productId` (STORE only, "Prebaci u donaciju"): body `donation_type`, optional `quantity` (default: everything available), `donation_price` (SPONSORED). Stock-safe transaction with `FOR UPDATE` on the product. 404 `"Proizvod nije pronađen."` (also for `Removed`), 403 `"Nemate ovlasti za doniranje ovog proizvoda."`, 400 `"Samo dostupni proizvodi se mogu prebaciti u donacije."` (not `Available` or expired), 400 `"Količina mora biti veća od nule."`, 400 `"Nema dovoljno proizvoda na raspolaganju."` when it exceeds `quantity − Pending − Confirmed − Completed`. The donation copies name, description, category, unit, `original_price` and `expiry_date` and stores `source_product_id`. A repeated move adds to the product's `Available` donation with the same `donation_type` and `donation_price` (locked `FOR UPDATE`): its quantity grows and the response is 200 `{ message: "Količina je dodana postojećoj donaciji.", donation }`; a different type or price, or an earlier donation that expired or was deleted, gives a new donation. Then: nothing reserved and everything donated → product `Removed`; otherwise `products.quantity` drops by the donated amount (reservations keep theirs) and `markSoldIfFullyConfirmed` may mark it `Sold`. 201 `{ message: "Proizvod je prebačen u donacije.", donation }`.
- `POST /:id/return-to-product` (STORE only, undoes a move): one transaction that locks the donation and then its source product. 404 `"Donacija nije pronađena."` (missing or `Removed`), 403 `"Nemate ovlasti za izmjenu ove donacije."`, 400 `"Samo aktivne donacije iz ponude se mogu vratiti."` (not `Available`, or no source product), 400 `"Proizvod je istekao i ne može se vratiti u ponudu."`. The product becomes `Available` (also from `Sold` or `Removed`); its quantity grows by the donation's quantity, except for a `Removed` product, which kept its old quantity when everything was moved and is rebuilt as Pending + Confirmed + Completed + the donation's quantity. The donation becomes `Removed`. 200 `{ message: "Donacija je vraćena u ponudu.", product }`.

Validation (`utils/validateDonation.ts`, `validateDonationFields` + `normalizeDonationFields`):
- Required: donation_type, name, category, quantity, unit, original_price, expiry_date → `"Sva polja su obavezna."`. Category in `DONATION_CATEGORIES` (product categories + `Meals`), unit in `DONATION_UNITS` (product units + `portion`) → the product messages. Quantity and value above 0 → `"Količina i vrijednost moraju biti pozitivni brojevi."`.
- `validateDonationPrice` (also used by from-product): unknown type → `"Vrsta donacije nije ispravna."`; SPONSORED needs a price above 0 → `"Donacijska cijena je obavezna i mora biti veća od nule."` and below the value → `"Donacijska cijena mora biti manja od vrijednosti proizvoda."`. A FREE donation's price is stored as NULL.
- Expiry date as for products. Pickup times `HH:MM[:SS]` → `"Vrijeme preuzimanja nije ispravno."`, start before end → `"Početak preuzimanja mora biti prije kraja."`.
- `allergens` must be codes from `ALLERGENS` (the 14 EU allergens) → `"Alergeni nisu ispravni."`; `serving_temperature` one of `HOT`, `COLD`, `FROZEN` → `"Način serviranja nije ispravan."`. Both are stored only for `Meals` and cleared otherwise.
- Keep the lists in sync with `client/src/utils/donations.ts`.

## Business logic worth knowing

- **Available quantity** is computed, never stored: `products.quantity` minus the sum of `Pending` + `Confirmed` + `Completed` reservation quantities (picked-up food is gone, so completing a reservation must not free its quantity). Partial reservations are allowed and the product stays `Available` until accepted reservations cover the full quantity.
- **Stock-safe pattern** (`createReservation`, `acceptReservation`, `updateProduct`; reject and cancel lock the reservation row instead): `pool.connect()`, `BEGIN`, `SELECT ... FOR UPDATE` on the product row, compute, write, `COMMIT`; `ROLLBACK` on any early return or error; `client.release()` in `finally`. Use the same pattern for anything that touches stock or a reservation's status. `markSoldIfFullyConfirmed(client, product)` (in `reservations.controller.ts`) marks a locked product `Sold` once Confirmed + Completed cover its quantity. `lockReservation` (same file) locks a reservation row for reject, cancel, complete and cancel-overdue and also returns `is_overdue`.
- **Notifications** are written with `createNotification(db, { userId, type, message, reservationId?, productId? })` from `utils/notifications.ts` as part of the action; `db` is the pool or the transaction client, so inserts inside a transaction commit or roll back with it. The client translates each one from `type` plus the joined product data; `message` is an **English fallback** (the one exception to "server messages are Bosnian"), for example `"New reservation request: 4kg Chicken"`. Types:

  | type | Recipient | Trigger | Links |
  |---|---|---|---|
  | `RESERVATION_CREATED` | store | `POST /reservations` (in the transaction) | reservation, product |
  | `RESERVATION_ACCEPTED` | restaurant | accept (in the transaction) | reservation, product |
  | `RESERVATION_REJECTED` | restaurant | reject (in the transaction) | reservation, product |
  | `RESERVATION_CANCELLED` | store | cancel by the restaurant (in the transaction) | reservation, product |
  | `PRODUCT_SOLD_OUT` | store | accept or product edit that makes the product `Sold` (in the transaction) | product |
  | `PRODUCT_EXPIRED` | store | expiry job, per expired product | product |
  | `RESERVATION_EXPIRED` | restaurant | expiry job, per cancelled reservation | reservation, product |
  | `PRODUCT_EXPIRING_SOON` | store | reminder job: `Available` product with `expiry_date = CURRENT_DATE + 1` and at least one Pending reservation | product |
  | `PICKUP_TODAY` | restaurant | reminder job: `Confirmed` reservation with `pickup_date::date = CURRENT_DATE` | reservation, product |
  | `RESERVATION_COMPLETED` | restaurant | complete by the store (in the transaction) | reservation, product |
  | `PICKUP_MISSED` | restaurant | cancel-overdue by the store (in the transaction) | reservation, product |

  Adding a type means updating `NotificationType` on both sides, the `notifications.types` keys in both locale files and `NOTIFICATION_META` on the client.
- **Expiry job** (`jobs/expireProducts.ts`, started from `server.ts` only): `expireProducts()` marks `Available` products past `expiry_date` as `Expired`, cancels their **Pending** reservations and notifies the stores and those restaurants, all in one transaction. Confirmed reservations are left as they are: the store already agreed to hand that food over, and it closes them itself (complete, or cancel-overdue after a missed pickup). In the same transaction `Available` donation offers past `expiry_date` become `Expired` (no notification yet, nobody but the donor sees them). `startExpirationJob()` runs it once at startup (to catch up on midnights missed while the server was down) and then on cron `0 0 * * *` in `APP_TIMEZONE`. Expiry checks in SQL use `expiry_date < CURRENT_DATE`, so a product is still valid on its expiry day.
- **Reminder job** (`jobs/notificationReminders.ts`, started from `server.ts` only): `sendReminders()` inserts `PRODUCT_EXPIRING_SOON` and `PICKUP_TODAY` with `INSERT ... SELECT ... WHERE NOT EXISTS` (same type for the same product or reservation), so each reminder is sent once no matter how often it runs; it returns `{ expiringSoon, pickupToday }` counts. `startReminderJob()` runs it at startup and on cron `0 7 * * *` in `APP_TIMEZONE`.
- **Soft delete and history:** reservations are never deleted, products are marked `Removed`.
- **Pickups:** only the store moves a reservation to `Completed` (`PATCH /:id/complete`) or cancels a missed one (`PATCH /:id/cancel-overdue`). Statistics count Confirmed + Completed as successful.
- **Global error handling** (`app.ts`, after the routers): unknown routes → 404 `"Ruta nije pronađena."`; `HttpError` (`utils/httpError.ts`, carries a status) → that status and message; multer errors → 400 (`"Slika je prevelika. Maksimalna veličina je 5MB."`); malformed JSON → 400 `"Neispravan format zahtjeva."`; anything else → 500 `"Došlo je do greške na serveru."`. Controllers still handle their own errors; this covers middleware and body parsing.

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
  - `createProduct(agent, overrides)`, `createDonation(agent, overrides)` and `reserve(agent, productId, quantity)` throw if the API refuses, so setup failures are obvious. Also `productPayload()`, `donationPayload()` and `userId(email)`.
  - `futureDate(days)` / `futurePickup(days)` build dates from the local date, so tests never go stale and agree with `CURRENT_DATE` around midnight.
  - `cleanupUsers(emails)` deletes the users' reservations (RESTRICT; both their own and those on their products), then the users, which cascades to products, notifications, favorites and templates.
- Each file uses its own email prefix (`products-store-a@test.com`, ...) and calls `cleanupUsers` in `afterEach`.
- Files:
  - `app`: 401, JSON 404, malformed JSON, missing body, `/uploads` static
  - `auth`, `middleware` (missing, malformed, foreign-secret and expired tokens; both roles)
  - `validateProduct` (unit), `products` (all filters, validation, ownership, delete states)
  - `productImport`: CSV import (comma and Excel-style `;` files, a bad row rejects the whole file, missing columns, empty file, too many rows, no file, wrong type, too large, unparseable, restaurant 403)
  - `reservations`: create validation, race condition, `/mine` and `/store` with filters, accept/reject/cancel ownership, state and expiry rules, quantity freed again
  - `pickups`: the three scopes and counts for both roles (overdue first, other party fields, ownership, name filter, invalid scope), complete (state, notification, ownership, stock stays taken, statistics) and cancel-overdue (only after the pickup day, not after a passed time today; quantity freed, Sold product back to Available unless expired, ownership)
  - `reservationRules`: quantity and pickup-date validation, simultaneous accept + cancel, price snapshot, product edit rules
  - `validation`: category/unit/date rules, date round trip, invalid ids and filters, pagination and sort, favorite must be a store, case-insensitive email and password length
  - `users` (profile, store list and details, logo upload incl. wrong type and size), `uploads` (file named by type, nosniff, old logo removed), `favorites`, `productTemplates`
  - `notifications`: every type and link, the routes, and the expiry and reminder jobs called directly, including what they must skip (the expiry job keeps Confirmed reservations)
  - `jobs`: cron expressions and error logging, with `node-cron` and the db mocked
  - `donations`: create for both roles with every validation message, FREE without a price, meal details kept only for meals, list filters and order, donor-only visibility, update/delete ownership and states, soft delete, moving a product (whole → `Removed`, part → quantity reduced and still on offer, repeated moves merged by type and price, returning a donation to its product (from `Removed`, `Sold` and partial, merged amount, refused cases, ownership), pending reservations kept, confirmed ones → `Sold`, too much, expired, other store, restaurant), and the expiry job expiring donations
  - `reports`: period validation (missing, invalid, reversed, longer than 366 days; a full leap year and a single day pass), CSV headers and file names, rows and totals for both roles (only Completed, in the period, own data), English headers, the formula guard, empty periods, impact per month with unit conversion; `csv` (unit tests for `toCsv`)
- Rows the API cannot create (past expiry dates, chosen statuses) are inserted with `pool.query`; reservations inserted that way need a `unit_price`. Use obviously nonexistent ids (`999999`) for 404 cases.
- Race condition test: two restaurants reserve 8 of 10 at the same time with `Promise.all`; the sorted statuses must equal `[201, 400]`.

## Seed

Both scripts share the generator in `src/scripts/fakeData.ts` (`insertFakeData(client, { productsPerStore, reservationsPerRestaurant })`, which runs inside the caller's transaction, and `printSummary`).

`npm run seed` (`src/scripts/seed.ts`) deletes all rows (notifications, reservations, donation offers, products, users; favorites and templates go with the users), then inserts 3 stores and 2 restaurants with full business data and fills them through `insertFakeData` (5 products per store, 4 reservations per restaurant, 2 donation offers per store and per restaurant), all in one transaction. All demo accounts use password `demo12345`: stores `market.centar@demo.com`, `pekara.dobra@demo.com`, `zeleni.market@demo.com`; restaurants `restoran.ukus@demo.com`, `pizzeria.roma@demo.com`.

`npm run seed:fake` (`src/scripts/seedFakeData.ts`) adds data on top of what exists and never creates, changes or deletes users. For every existing STORE it inserts random products from a template list (all categories, prices with a 30-60% discount, expiry today to 14 days out). For every existing RESTAURANT it inserts reservations on those new products with weighted statuses (Pending, Confirmed, Completed, Rejected, Cancelled) and the product's price as `unit_price`; Pending + Confirmed + Completed quantities never exceed a product's quantity, Confirmed pickups are from today up to 4 days out (so the pickups page has data for today), Completed pickups are in the past with `picked_up_at` set, and it writes the same notifications the app sends for new, accepted and rejected reservations (`RESERVATION_CREATED`, `RESERVATION_ACCEPTED`, `RESERVATION_REJECTED`, with links). It also adds 2 donation offers per store (product lines, randomly FREE or SPONSORED at 40% of the value) and 2 per restaurant (meals in portions from `MEAL_TEMPLATES`, with allergens, serving temperature and a 19:00–21:00 pickup window). Everything runs in one transaction. Options: `npm run seed:fake -- --products <per store, default 6> --reservations <per restaurant, default 4>`.

## Pending and known limitations

- **Deployment:** `sameSite: "strict"` breaks cookie auth when the frontend and backend are on different domains (needs `none` + `secure`, or a shared domain); set `CLIENT_ORIGIN` to the deployed frontend; logo uploads on local disk are lost on Render restarts (needs cloud storage; Cloudinary is not available in the owner's country, so evaluate alternatives). With more than one server instance the cron jobs would run once per instance (they are idempotent, but a lock or a separate worker is cleaner).
- Server messages should become error keys translated on the client.
- `PUT /users/me`: replace `COALESCE` with a real PATCH that can clear optional fields.
- Migrations are still JavaScript. They have already run, so they stay as they are; a new migration can be written in TypeScript once `node-pg-migrate` runs with a TS loader (for example `tsx`).
- The server has no ESLint setup.
