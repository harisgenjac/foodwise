# CLAUDE.md

FoodWise ("Još vrijedi") is a B2B marketplace where stores sell near-expiry food at a discount to restaurants, with a humanitarian donation module planned. It is developed as a production product: write production-quality code, keep tests passing, and keep the docs current.

## Where to look (read only what the task needs)

| Task involves | Read |
|---|---|
| Server code: API endpoints, DB schema, migrations, auth, reservation logic, cron, uploads, backend tests, seed | `docs/backend.md` |
| Client code: pages, components, hooks, routing, i18n, styling, types | `docs/frontend.md` |
| Product intent: users and roles, business rules, roadmap, humanitarian module, naming and tone | `docs/product.md` |

Do not load all three by default. A feature that spans both sides (for example a new endpoint plus a page) needs `backend.md` and `frontend.md`. Open `product.md` when a business rule or priority is unclear. These docs were written from the code: if the code and a doc disagree, trust the code and fix the doc in the same change.

## Repo layout

```
food-saver-app/
├── CLAUDE.md
├── README.md        setup and run instructions for humans (keep in sync with scripts and env vars)
├── package.json     root scripts only (dev/build/install:all for both sides)
├── docs/            backend.md, frontend.md, product.md
├── server/          Express 5 + TypeScript + PostgreSQL (src/, migrations/, tests/, uploads/)
└── client/          React 19 + Vite + TypeScript + Tailwind + react-i18next (src/)
```

The root `package.json` only holds convenience scripts (it has `concurrently` as its only dependency). The app's dependencies and all other commands (tests, migrations, seed, lint) live in `server/` and `client/`.

Root scripts:
- `npm run install:all`: installs dependencies in the root, `server/` and `client/`.
- `npm run dev`: builds the server once (`predev`), then runs the server and client dev servers together, with output prefixed `[server]` / `[client]`.
- `npm run build`: builds the server and then the client.

## Quick start

1. PostgreSQL is running, and `server/.env` and `server/.env.test` exist (`DATABASE_URL`, `JWT_SECRET`).
2. First time: `npm run install:all`, then `cd server && npm run migrate up`.
3. From the root: `npm run dev`. Backend at http://localhost:3000 (API under `/api`), frontend at http://localhost:5173.

Each side can still be run on its own with `npm run dev` inside `server/` or `client/` (the server's `dev` runs the compiled `dist/`, so `npm run build` must have run at least once).

More commands (tests, seed, lint, type-check) are in the two technical docs.

## Rules that apply everywhere

- **API responses:** `{ error: "..." }` for failures, `{ message, <entity> }` for successes.
- **Server messages are in English** (errors, success messages, log lines) and the tests assert on them. Keep new ones in English and consistent with existing wording (e.g. `"Product not found."`, `"An error occurred while fetching products."`). UI translation stays on the client: notification text is translated from the notification `type` (the stored `message` is an English fallback), and CSV reports follow the `lang` query param.
- **Authorization checks ownership, not only role.**
- **SQL:** parameterized queries only. With a JOIN, always use explicit `table.column` prefixes and never a bare `*`.
- **Migrations:** never edit one that has already been run. Every schema change is a new migration.
- **UI strings:** every user-visible string goes through `t()` with keys in both `client/src/i18n/locales/bs.json` and `en.json`.
- **Imports:** local imports end in `.js` (server and client), even when the source file is `.ts`/`.tsx`.
- **Postgres types:** `DECIMAL`/`NUMERIC` and `COUNT(*)` arrive as `string`; `INTEGER`/`SERIAL` ids arrive as `number`.
- **Secrets and artifacts:** never commit `.env*`, `dist/`, `node_modules/` or `server/uploads/*` (only `uploads/logos/.gitkeep`). Do not read or print `.env` files.
- **Git:** non-trivial work goes on a feature branch and a PR. Check the current branch and `git remote -v` before pushing.
- **Docs stay current.** At the end of every task, check whether it changed anything the docs describe and update them in the same change:
  - `docs/backend.md`: endpoints, schema or migrations, auth, business logic, conventions, tests, env vars
  - `docs/frontend.md`: routes, components, hooks, types, i18n structure, UI conventions
  - `docs/product.md`: new or finished features, changed business rules, roadmap and product decisions
  If a doc and the code disagree, trust the code and fix the doc. Do not leave known-wrong text behind.



  