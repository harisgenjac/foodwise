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
├── docs/            backend.md, frontend.md, product.md
├── server/          Express 5 + TypeScript + PostgreSQL (src/, migrations/, tests/, uploads/)
└── client/          React 19 + Vite + TypeScript + Tailwind + react-i18next (src/)
```

There is no root `package.json`. Run npm commands inside `server/` or `client/`.

## Quick start (two terminals)

1. PostgreSQL is running, and `server/.env` and `server/.env.test` exist (`DATABASE_URL`, `JWT_SECRET`).
2. Backend (http://localhost:3000, API under `/api`):
   `cd server && npm run migrate up && npm run build && npm run dev`
   `dev` runs the compiled `dist/` output, so `build` must have run at least once.
3. Frontend (http://localhost:5173):
   `cd client && npm run dev`

More commands (tests, seed, lint, type-check) are in the two technical docs.

## Rules that apply everywhere

- **API responses:** `{ error: "..." }` for failures, `{ message, <entity> }` for successes.
- **Server messages are in Bosnian** (errors, success messages, notification text) and the tests assert on them. Keep new ones in Bosnian and consistent with existing wording.
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



  