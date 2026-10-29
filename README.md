# FoodWise (Još vrijedi)

[![CI](https://github.com/harisgenjac/foodwise/actions/workflows/ci.yml/badge.svg)](https://github.com/harisgenjac/foodwise/actions/workflows/ci.yml)

A B2B marketplace where **stores** sell food that is close to its expiry date at a discount to **restaurants**. Stores recover some revenue, restaurants get cheaper ingredients, and less food is thrown away. A humanitarian donation module is planned.

## Features

- **Stores** list near-expiry products (price, discounted price, quantity, expiry date), accept or reject reservations, and see their statistics.
- **Restaurants** browse and filter offers, view store profiles, save favorite stores, reserve a quantity with a pickup time, and track reservation status.
- **Admins** create store, restaurant and admin accounts, block and unblock accounts, remove offers that break the rules, and see platform statistics and an audit log. There is no public registration for stores and restaurants.
- Partial reservations, with available quantity calculated so two restaurants can never reserve more than exists.
- In-app notifications for every reservation change.
- A daily job marks expired products and cancels their open reservations.
- Bosnian and English UI.

## Tech stack

| Part | Stack |
|---|---|
| Backend (`server/`) | Node.js 24, Express 5, TypeScript, PostgreSQL (raw `pg`, `node-pg-migrate`), JWT in an httpOnly cookie, `multer`, `node-cron` |
| Frontend (`client/`) | React 19, Vite, TypeScript, Tailwind CSS, React Router 7, axios, react-i18next, lucide-react |
| Tests | Server: Vitest + supertest against a real PostgreSQL database. Client: Vitest + Testing Library (jsdom) |

## Requirements

- Node.js 24
- PostgreSQL

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/harisgenjac/foodwise.git
cd foodwise
npm run install:all
```

`install:all` installs the dependencies in the root, `server/` and `client/`.

### 2. Create the databases

```sql
CREATE DATABASE food_saver_db;
CREATE DATABASE food_saver_test_db;
```

The database names are only examples; the app uses whatever `DATABASE_URL` points to. The test database is needed only for running tests.

### 3. Configure the environment

Create `server/.env`:

```env
DATABASE_URL=postgres://<user>:<password>@localhost:5432/food_saver_db
JWT_SECRET=<a long random string>
PORT=3000
```

Create `server/.env.test` with the same variables, pointing `DATABASE_URL` at `food_saver_test_db`.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Secret used to sign auth tokens |
| `PORT` | no | API port, default `3000` |
| `NODE_ENV` | no | `production` makes the auth cookie `secure` |
| `CLIENT_ORIGIN` | no | Frontend origin(s) allowed by CORS and the origin check (comma-separated list allowed), default `http://localhost:5173` |
| `APP_TIMEZONE` | no | Business time zone for expiry dates and the scheduled jobs, default `Europe/Sarajevo` |

The client reads an optional `VITE_API_URL` (backend origin without `/api`, default `http://localhost:3000`), for example from `client/.env.local`.

Never commit `.env` files.

### 4. Run the migrations

```bash
cd server
npm run migrate up
```

### 5. Create the first admin

```bash
cd server
npm run create-admin -- <email> <password> [first name] [last name]
```

Stores, restaurants and further admins are then created by an admin in the app (**Novi korisnik** / **New user**), with only an email and a password. The user fills in the rest of the profile after the first login.

### 6. Start the app

From the root:

```bash
npm run dev
```

This builds the server once, then runs the backend and frontend together:

- Frontend: http://localhost:5173
- API: http://localhost:3000/api

## Scripts

### Root

| Command | Description |
|---|---|
| `npm run dev` | Builds the server, then runs the server and client dev servers together |
| `npm run build` | Builds the server and then the client |
| `npm run install:all` | Installs dependencies in the root, `server/` and `client/` |

### Server (`cd server`)

| Command | Description |
|---|---|
| `npm run dev` | Compiles in watch mode and restarts the server on changes (needs one `npm run build` first) |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm start` | Runs the compiled server |
| `npm run migrate up` / `down` | Applies or rolls back migrations |
| `npm run migrate create <name>` | Creates a new migration |
| `npm test` | Runs the tests against the test database (apply its schema first with `npx dotenv -e .env.test -- node-pg-migrate up`) |
| `npm run test:watch` | Runs the tests in watch mode |
| `npm run typecheck` | Type-checks the source and the tests |
| `npm run seed` | Builds, then replaces all data with demo data that simulates two months of use |
| `npm run create-admin -- <email> <password> [first] [last]` | Builds, then creates an admin account |

### Client (`cd client`)

| Command | Description |
|---|---|
| `npm run dev` | Starts the Vite dev server |
| `npm run build` | Builds for production |
| `npm run lint` | Runs ESLint |
| `npm test` | Runs the component and unit tests (no server needed) |
| `npm run test:watch` | Runs the tests in watch mode |
| `npm run typecheck` | Type-checks |

## Demo accounts

After `npm run seed`, every demo account uses the password `To12345678`:

| Role | Email |
|---|---|
| Store (10) | `market.centar@demo.com`, `zeleni.market@demo.com`, `mesnica.bosna@demo.com`, `pekara.dobra@demo.com`, `mljekara.vrelo@demo.com`, `ribarnica.neretva@demo.com`, `market.neretva@demo.com`, `vocarna.butmir@demo.com`, `pekara.somun@demo.com`, `bio.kutak@demo.com` |
| Restaurant (10) | `restoran.ukus@demo.com`, `bistro.avlija@demo.com`, `pizzeria.roma@demo.com`, `restoran.starigrad@demo.com`, `kafana.most@demo.com`, `restoran.panorama@demo.com`, `bistro.zelenikutak@demo.com`, `pizzeria.napoli@demo.com`, `restoran.tvrdjava@demo.com`, `ascinica.sofra@demo.com` |
| Admin | `admin@demo.com`, `admin2@demo.com` |
| Company HQ (Bingo d.o.o.) | `bingo@demo.com` |
| Bingo branches (5) | `bingo.sarajevo@demo.com`, `bingo.visoko@demo.com`, `bingo.kakanj@demo.com`, `bingo.zenica@demo.com`, `bingo.tuzla@demo.com` |

The seed deletes all existing data and rebuilds the last two months of activity: products, reservations in every status, donations, subscriptions and credits, notifications and announcements.

## Project structure

```
foodwise/
├── package.json     root scripts (dev, build, install:all)
├── docs/            detailed documentation
├── server/          Express API (src/, migrations/, tests/, uploads/)
└── client/          React app (src/)
```

## Documentation

- [`docs/product.md`](docs/product.md): users and roles, business rules, roadmap
- [`docs/backend.md`](docs/backend.md): API endpoints, database schema, auth, tests
- [`docs/frontend.md`](docs/frontend.md): routes, components, hooks, i18n, UI conventions

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs the typecheck, tests and build of the changed side (server, client or both) on every pull request to `main` and every push to `main`. The `CI passed` check sums up the run. Dependabot opens weekly dependency update PRs (minor and patch grouped), and new PRs start from a template with a checklist. Details: the CI section in [`docs/backend.md`](docs/backend.md).

## Known limitations

- Notifications use polling, not push.
- Deployment is not set up yet: the auth cookie uses `sameSite: "strict"` (frontend and backend need a shared domain) and logos are stored on local disk.
