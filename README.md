# FoodWise (Još vrijedi)

A B2B marketplace where **stores** sell food that is close to its expiry date at a discount to **restaurants**. Stores recover some revenue, restaurants get cheaper ingredients, and less food is thrown away. A humanitarian donation module is planned.

## Features

- **Stores** list near-expiry products (price, discounted price, quantity, expiry date), accept or reject reservations, and see their statistics.
- **Restaurants** browse and filter offers, view store profiles, save favorite stores, reserve a quantity with a pickup time, and track reservation status.
- Partial reservations, with available quantity calculated so two restaurants can never reserve more than exists.
- In-app notifications for every reservation change.
- A daily job marks expired products and cancels their open reservations.
- Bosnian and English UI.

## Tech stack

| Part | Stack |
|---|---|
| Backend (`server/`) | Node.js 24, Express 5, TypeScript, PostgreSQL (raw `pg`, `node-pg-migrate`), JWT in an httpOnly cookie, `multer`, `node-cron` |
| Frontend (`client/`) | React 19, Vite, TypeScript, Tailwind CSS, React Router 7, axios, react-i18next, lucide-react |
| Tests | Jest + supertest against a real PostgreSQL database |

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

Never commit `.env` files.

### 4. Run the migrations

```bash
cd server
npm run migrate up
```

### 5. Start the app

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
| `npm run seed` | Replaces all data with demo data |
| `npm run seed:fake` | Adds fake products and reservations for the existing stores and restaurants, without touching users (`-- --products 6 --reservations 4`) |

### Client (`cd client`)

| Command | Description |
|---|---|
| `npm run dev` | Starts the Vite dev server |
| `npm run build` | Builds for production |
| `npm run lint` | Runs ESLint |
| `npx tsc` | Type-checks |

## Demo accounts

After `npm run seed`, every demo account uses the password `demo12345`:

| Role | Email |
|---|---|
| Store | `market.centar@demo.com`, `pekara.dobra@demo.com`, `zeleni.market@demo.com` |
| Restaurant | `restoran.ukus@demo.com`, `pizzeria.roma@demo.com` |

The seed deletes all existing data before inserting the demo data.

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

## Known limitations

- The seed script and the backend tests have not been moved to the TypeScript layout yet. They import files that now exist only as `.ts`, so `npm run seed` and `npm test` need that migration before they run. See "Pending and known limitations" in [`docs/backend.md`](docs/backend.md).
- Notifications use polling, not push.
- The app is configured for local development only (the CORS origin and the client's API URL are hard-coded to localhost).
