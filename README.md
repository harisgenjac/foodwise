# Još vrijedi

[![CI](https://github.com/harisgenjac/foodwise/actions/workflows/ci.yml/badge.svg)](https://github.com/harisgenjac/foodwise/actions/workflows/ci.yml)

A B2B marketplace where **stores** sell food that is close to its expiry date at a discount to **restaurants**. Stores recover some revenue, restaurants get cheaper ingredients, and less food is thrown away. A humanitarian layer is being built on top of it, starting with donation offers.

## Features

- **Stores** publish near-expiry products (one by one, from saved templates or by CSV import), accept orders in full, in part or per item with a reason, prepare them from a daily packing list, hand them over at pickup or to a courier, and download sales and impact reports.
- **Restaurants** search offers grouped by store and sorted by distance, browse store pages and favourites, fill a one-store cart and send it as an order for **pickup or delivery**, follow every order live, report problems and rate the courier.
- **Store chains**: a company headquarters creates and manages its branches, chooses and pays their plans and credits, and sees an overview and reports for the whole chain.
- **Admins** create every account by invitation (there is no public registration for businesses), block accounts, moderate products and donations, settle order disputes, answer problem reports, send announcements, and see platform statistics and an audit log.
- **Credits**: stores pay with monthly credits (a subscription plus top-ups, approved by an admin); ordering is free for restaurants.
- **Donation offers**: stores and restaurants publish free or donor-paid donations, including ready meals with allergens.
- Stock is calculated so two restaurants can never order more than exists; expired products and unanswered orders are handled automatically.
- Live updates, in-app notifications and emails for every order change.
- Delivery runs through a `DeliveryProvider` interface, with a simulated provider until a real delivery service is connected.
- Bosnian and English UI, with a phone layout for every role.

## Tech stack

| Part | Stack |
|---|---|
| Backend (`server/`) | Node.js 24, Express 5, TypeScript, PostgreSQL (raw `pg`, `node-pg-migrate`), JWT in an httpOnly cookie, `multer`, `node-cron` |
| Frontend (`client/`) | React 19, Vite, TypeScript, Tailwind CSS, React Router 7, axios, react-i18next, lucide-react |
| Tests | Server: Vitest + supertest against a real PostgreSQL database. Client: Vitest + Testing Library. End-to-end: Playwright |
| CI | GitHub Actions: typecheck, tests, build and the e2e suite on every pull request |

## Getting started

Requirements: Node.js 24 and PostgreSQL.

```bash
git clone https://github.com/harisgenjac/foodwise.git
cd foodwise
npm run install:all
```

Create a database (for example `food_saver_db`) and `server/.env`:

```env
DATABASE_URL=postgres://<user>:<password>@localhost:5432/food_saver_db
JWT_SECRET=<a long random string>
PORT=3000
```

Every other variable is optional; `server/.env.example` lists them all with comments. Never commit `.env` files.

Run the migrations and create the first admin:

```bash
cd server
npm run migrate up
npm run create-admin -- <email> <password> [first name] [last name]
```

Then start everything from the root:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000/api

The admin then creates stores, restaurants and companies in the app. To fill the app with sample businesses and two months of activity instead, run `npm run seed:demo` in `server/` (it deletes all existing data).

## Project structure

```
foodwise/
├── package.json        root scripts (dev, build, install:all)
├── docker-compose.yml  Mailpit for local emails
├── docs/               detailed documentation
├── server/             Express API (src/, migrations/, tests/)
├── client/             React app (src/)
└── e2e/                Playwright end-to-end tests
```

## Documentation

- [`docs/product.md`](docs/product.md): the app today: users and roles, business rules
- [`docs/development-plan.md`](docs/development-plan.md): roadmap, ideas backlog, open questions
- [`docs/backend.md`](docs/backend.md): API, database schema, auth, emails, environment variables, scripts, tests, seed, CI
- [`docs/frontend.md`](docs/frontend.md): routes, components, hooks, i18n, UI conventions, end-to-end tests
