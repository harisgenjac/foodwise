# CLAUDE.md

FoodWise ("Još vrijedi") is a B2B marketplace where stores sell near-expiry food at a discount to restaurants, with a humanitarian donation module planned. It is developed as a production product: write production-quality code, keep tests passing, and keep the docs current.

## Where to look (read only what the task needs)

| Task involves | Read |
|---|---|
| Server code: API endpoints, DB schema, migrations, auth, reservation logic, cron, uploads, backend tests, seed | `docs/backend.md` |
| Client code: pages, components, hooks, routing, i18n, styling, types | `docs/frontend.md` |
| The app as it is today: users and roles, how it behaves, business rules, the humanitarian purpose, naming and tone | `docs/product.md` |
| The future: planned features, phases, ideas backlog, decided-against items, open questions | `docs/development-plan.md` |
| E2E tests: Playwright, the e2e database and seed, locators, the CI job and traces | `docs/e2e.md` |

Do not load them all by default. A feature that spans both sides (for example a new endpoint plus a page) needs `backend.md` and `frontend.md`. Open `product.md` when a business rule is unclear, and `development-plan.md` for priorities and planned work. These docs were written from the code: if the code and a doc disagree, trust the code and fix the doc in the same change.

## Development plan (`docs/development-plan.md`)

Everything in the future: the agreed rules and tasks (as checkboxes) for orders and delivery (Korpa), new roles, organization verification, emails, mobile layout and sponsorship, plus the ideas backlog, decided-against items and open questions. `docs/product.md` describes only the current app; never put roadmap items there, at most a one-line "not built yet, see the development plan" pointer.

- The user's prompts decide what to work on, not the order in the plan. Do not start, suggest or add tasks the user did not ask for.
- Before designing or building a task, read the plan sections that touch it and follow the agreed rules there (e.g. one store per order, stores pay only credits, restaurants pay no credits, cash to the courier, accepting per item, `DeliveryProvider` interface).
- If the task depends on something in the plan that is not built yet, or conflicts with the plan, say so before starting and ask how to proceed.
- If we decide something different from the plan, say so and update the plan so it stays true.
- When a plan task is done, in the same change describe the new behaviour in `docs/product.md` and tick the task's checkbox in the plan. Do not rewrite or reorder the rest of the plan.

## Repo layout

```
food-saver-app/
├── CLAUDE.md
├── README.md        setup and run instructions for humans (keep in sync with scripts and env vars)
├── package.json     root scripts only (dev/build/install:all for both sides)
├── docker-compose.yml  Mailpit (catches local and e2e emails)
├── docs/            backend.md, frontend.md, product.md, e2e.md, development-plan.md
├── server/          Express 5 + TypeScript + PostgreSQL (src/, migrations/, tests/, uploads/)
├── client/          React 19 + Vite + TypeScript + Tailwind + react-i18next (src/)
└── e2e/             Playwright end-to-end tests (own package, own database)
```

The root `package.json` only holds convenience scripts (it has `concurrently` as its only dependency). The app's dependencies and all other commands (tests, migrations, seed, lint) live in `server/`, `client/` and `e2e/`.

Root scripts:
- `npm run install:all`: installs dependencies in the root, `server/`, `client/` and `e2e/`.
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
- **Server messages are in English** (errors, success messages, log lines) and the tests assert on them. Keep new ones in English and consistent with existing wording (e.g. `"Product not found."`, `"An error occurred while fetching products."`). UI translation stays on the client: `error`/`message` texts are translated by their exact English text from `client/src/i18n/locales/server.bs.json` (an axios interceptor applies it; a client test fails when a server text has no entry, so a new or reworded message needs one), notification text is translated from the notification `type` (the stored `message` is an English fallback), and CSV reports follow the `lang` query param.
- **Authorization checks ownership, not only role.**
- **SQL:** parameterized queries only. With a JOIN, always use explicit `table.column` prefixes and never a bare `*`.
- **Migrations:** never edit one that has already been run. Every schema change is a new migration.
- **UI strings:** every user-visible string goes through `t()` with keys in both `client/src/i18n/locales/bs.json` and `en.json`.
- **Imports:** local imports end in `.js` (server and client), even when the source file is `.ts`/`.tsx`.
- **Postgres types:** `DECIMAL`/`NUMERIC` and `COUNT(*)` arrive as `string`; `INTEGER`/`SERIAL` ids arrive as `number`.
- **Secrets and artifacts:** never commit `.env*`, `dist/`, `node_modules/` or `server/uploads/*` (only `uploads/logos/.gitkeep`). Do not read or print `.env` files.
- **Git:** non-trivial work goes on a feature branch and a PR. Check the current branch and `git remote -v` before pushing.
- **Tests and CI:**
  - Before committing, run the typecheck of the package you changed (`npm run typecheck`) and only the test files for what you changed: `npx vitest run --reporter=dot <files>` (in `server/`: `npx dotenv run -q -f .env.test -- vitest run --reporter=dot <files>`).
  - Run lint, typecheck and tests without piping their output (no `| tail`, `| head` or `| grep`, which hide the exit code), check that each one exits with 0, and never commit or push while any of them fails.
  - Never run the full test suites locally; CI (GitHub Actions, `.github/workflows/ci.yml`) runs them on every PR.
  - Do not run the whole e2e suite locally unless the user asks; CI runs it. When writing a new e2e test, run only that test file (`cd e2e && npm run e2e -- tests/<file>.spec.ts`); a change in `e2e/` also needs `npm run typecheck` there.
  - When CI fails, read only the failed logs with the GitHub CLI (`gh pr checks`, `gh run view <id> --log-failed`) and fix from there.
- **Docs stay current.** At the end of every task, check whether it changed anything the docs describe and update them in the same change:
  - `docs/backend.md`: endpoints, schema or migrations, auth, business logic, conventions, tests, env vars
  - `docs/frontend.md`: routes, components, hooks, types, i18n structure, UI conventions
  - `docs/product.md`: finished features and changed business rules (the current app only)
  - `docs/development-plan.md`: tick finished tasks; record changed plans, new ideas and product decisions
  If a doc and the code disagree, trust the code and fix the doc. Do not leave known-wrong text behind.



  
## CodeRabbit review comments

When I ask you to handle the CodeRabbit review on a PR:
- Read the summary with `gh pr view <number> --comments`.
- Read the line comments with `gh api repos/harisgenjac/foodwise/pulls/<number>/comments`
  (or the GraphQL reviewThreads query to get only unresolved threads).
- Use each comment's "Prompt for AI Agents" section when present.
- For each comment, tell me in one line whether you agree and why. Fix only the
  ones I confirm, run the affected tests and the typecheck, then push to the same
  branch. Do not resolve threads yourself; I resolve them on GitHub.
