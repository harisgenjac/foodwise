# Feature spec: Credit-based subscription system

## How to work (read first)
You already know this project. Before writing any code:

1. Re-read the relevant parts of the codebase (schema/migrations, product and reservation models
   and statuses, routes, auth/role middleware, sidebar, My Profile page, admin pages, notifications).
2. **Check every rule below against the app's current rules and code.** If a rule conflicts with
   how the app works today, breaks an existing flow, or is not possible with the current data model
   (e.g. product statuses, how reservations are confirmed/rejected/expired, how categories are stored),
   **do not silently work around it. List each conflict, explain why, and propose options so we can
   clarify it together.** Same if any rule is ambiguous: ask, don't assume.
3. Write a short implementation plan (files to create/change, migrations, order of work) and
   **stop and wait for my approval.**
4. **Scope check:** this is a large feature. If it can't be done well in one session, or you're likely
   to run out of context/usage before finishing, tell me up front and propose splitting it into parts
   (the phases below are a starting point). Finish each part completely, stop, summarize what changed
   and how I can test it, then wait for me before the next part. Never leave a part half-done.

General: don't break existing product/reservation flows, follow existing conventions, and comment
the key logic (credit checks, refund eligibility, DB transactions) explaining *why*.

## Context
B2B marketplace: stores list near-expiry food, restaurants reserve it. Both roles can also add
donations (separate per role; a restaurant cannot reserve a store's donation). Roles: STORE,
RESTAURANT, ADMIN. Stack: Node.js + Express + PostgreSQL, React frontend.

We are adding monthly credits. Payment is offline for now: users send a request, an admin
approves it. Card payments, auto-approval and invoicing come later, so keep the design extensible.

## Plans and periods
- Plans: 20, 50, 150 credits per month. Store them in a `plans` table, not hardcoded.
- A period is a **calendar month** (1st to last day).
- If the month has already started, the user may pick a smaller plan for that month.
- Unused credits do not roll over.
- A plan change takes effect from the next month.
- Credits that an admin adds manually (outside a plan) go into the **current month**.

## Top-ups (extra credits)
- A user with an **active subscription for the current month** can buy extra credits:
  packages of **10, 20 or 50** credits. Store packages in a table, not hardcoded.
- A top-up is a request to the admin, same flow and statuses as a subscription request.
- Approved top-up credits are added to the **current month**.
- Users without an active subscription cannot top up; they must subscribe first.
- OPEN (ask me before implementing; my proposed defaults in brackets):
  - Do top-up credits expire at the end of the month like plan credits? [yes]
  - Can a user have more than one PENDING top-up at a time? [no, max one]

## Global rules
1. Donations (store products or restaurant meals) never cost a credit.
2. **Same-day refund rule:** a refund is only possible if it happens on the same day as the charge.
3. **Exception:** if a reservation is rejected/cancelled by the STORE, or cancelled by the SYSTEM
   (e.g. expired, product removed), the restaurant is ALWAYS refunded, regardless of the day.
   If a new month has started in the meantime, the refund goes into the **current (new) month**,
   if the user has an active subscription.
4. **Day boundary:** a new day starts at **00:00 in `Europe/London`** (= 01:00 in Sarajevo), so the
   day has changed everywhere in Europe. Compute this on the backend only, timezone-aware (DST-safe).
5. Every refund references its original charge; a charge can be refunded at most once.
6. When credits run out, existing products and reservations stay visible and fully functional.
   Credits only limit new actions.

## STORE: 1 credit per published (non-donation) product
1. Creating a regular product charges 1 credit immediately. Balance 0 → reject.
2. Creating a donation product: no charge.
3. Regular → donation, no reservations, same day: refund. After the day boundary: no refund.
4. Donation → regular, or re-activating a product: charge 1 credit again. Balance 0 → block.
   (Ask me how "re-activation" maps to the current product statuses.)
5. Deleting a product with no reservations, same day: refund. After the day boundary: no refund.
6. Products with reservations cannot be deleted (verify this is enforced on the backend).
   Safety rule: if one is deleted anyway, the credit stays charged.
7. After publishing, **only quantity and expiry date are locked** (disable in UI AND reject in API).
   All other fields stay editable.

## RESTAURANT: 1 credit per reservation
1. Creating a reservation charges 1 credit immediately. Balance 0 → reject.
2. Adding a donation meal: no charge.
3. Restaurant cancels an unconfirmed reservation, same day: refund. After the day boundary: no refund.
4. Store rejects/cancels the reservation, or the system cancels it: always refund (global rule 3).

## Data model (suggested, adapt to the existing schema)
- `plans` (id, name, credits_per_period, price, is_active)
- `topup_packages` (id, credits, price, is_active)
- `subscriptions` (id, user_id, plan_id, period_month, period_start, period_end, status, auto_renew)
- `credit_transactions` — **append-only ledger**, never update/delete rows:
  (id, user_id, subscription_id, amount +/-, type, reason, related_entity_type, related_entity_id,
   refunds_transaction_id nullable UNIQUE, created_by user/admin/system, created_at)
  Types: PLAN_GRANT, TOPUP_GRANT, ADMIN_ADJUSTMENT, PRODUCT_CHARGE, PRODUCT_REFUND,
         RESERVATION_CHARGE, RESERVATION_REFUND.
- `credit_requests` (id, user_id, request_type SUBSCRIPTION/TOPUP, plan_id nullable,
  topup_package_id nullable, period_month, auto_renew, status PENDING/APPROVED/REJECTED,
  admin_note, created_at, reviewed_by, reviewed_at).
  - Only one PENDING SUBSCRIPTION request per user per month (enforce with a DB constraint,
    e.g. a partial unique index, not just in code).
  - `admin_note` is **internal**: never return it in user-facing API responses.
- Balance = sum of ledger rows for the active period. No mutable counter (a cached value is OK only
  if updated in the same DB transaction).
- Store the product/reservation category on the charge (or make it joinable) so the
  "by category" view is a simple query.

## Integrity
- Credit check + charge + creating the product/reservation = ONE PostgreSQL transaction, with the
  active subscription row locked (`SELECT ... FOR UPDATE`), so parallel requests can't both spend
  the last credit.
- All credit logic lives in one service (e.g. `creditService`: `chargeForProduct`,
  `refundForProduct`, `chargeForReservation`, `refundForReservation`, `grantPlan`, `grantTopup`,
  `getBalance`, `isRefundEligible`). Routes never touch the ledger directly.
- No-credit error: HTTP 402
  `{ code: "INSUFFICIENT_CREDITS", hasActiveSubscription: boolean, message, actionUrl }`
  where `actionUrl` points to the top-up section if the user has a subscription,
  otherwise to the subscription section on My Profile.

## Subscription flow
1. On **My Profile**, a subscription section shows current plan, period, balance and request status.
2. Choosing a plan opens a modal explaining what credits are, how they're charged and refunded
   (plain language, from the rules above) and where to check the balance.
3. User picks **this month only** or **auto-renew**, submits → PENDING request.
4. Admin approves (creates subscription + PLAN_GRANT) or rejects, optionally with an internal note.
5. **Auto-renew:** the system automatically creates the next month's request **2 days before the
   new month starts**, so the admin can approve it in time (use a scheduled job; reuse an existing
   scheduler if the project has one). Show a **tooltip** next to the auto-renew option explaining
   this. User can turn auto-renew off; next month's plan (approved or still requested) stays and
   just does not renew after that month.
6. Users see their request status but never the admin note.

## Top-up flow
1. In the My Profile subscription section, a "Buy extra credits" option (visible only with an
   active subscription) lets the user pick 10, 20 or 50 credits → PENDING TOPUP request.
2. Admin approves (TOPUP_GRANT into the current month) or rejects, optionally with an internal note.

## Credits page (new "Credits" sidebar item for STORE and RESTAURANT)
**Box 1 (full width):** short explanation; Used, Available, Usage period (from–to), Total;
usage progress bar with percent label; "Last refreshed on: <date time>" below it.
Bar color: green 0–70%, orange >70% (70.01%) to <90%, red ≥90%.

**Box 2 (full width, same width as Box 1):** year dropdown (default: current year), tabs
"By month" and "By category".
- By month: 12 rows Jan–Dec. Row = month — bar — credit numbers. Dark blue = used,
  light blue = unused. Months without a subscription and future months are grey.
- By category: rows are product categories (meat, fish, ...), same for both roles.
  Row = category — bar — credit number. The bar shows the category's share of all credits used
  in the selected year (dark blue only, no light-blue "unused" part).
  Store: credits by category of its products. Restaurant: by category of reserved products.

## Banners and hints
- At ≥80% usage: "You have N credits left", linking to the **Credits** page (sidebar).
- Active subscription but 0 credits left: banner saying they can **buy extra credits**, linking to
  the top-up option on My Profile.
- No subscription: banner saying a subscription is required, linking to **My Profile**.
- Add product / create reservation forms show "This will use 1 credit (N left)".
- On INSUFFICIENT_CREDITS show an error with a link to `actionUrl`.

## Admin
- Overview of all stores and restaurants: plan, period, used, available, total; filter by role, search.
- Requests list (subscriptions and top-ups, filterable by type): approve / reject with an
  internal note.
- Manual credit adjustment (+/−) with required reason → ADMIN_ADJUSTMENT in the current month.
- Per-user ledger view.

## Suggested phases
- Phase 0: codebase review, conflict list, open questions, plan → stop for approval.
- Phase 1: migrations + creditService + unit tests.
- Phase 2: hook charges/refunds into product and reservation flows; edit locks; API errors.
- Phase 3: subscription and top-up requests, auto-renew job, admin approval, admin overview,
  manual adjustments.
- Phase 4: Credits page, My Profile subscription/top-up section, banners, form hints, tooltip.

## Required tests
- charge succeeds / fails at 0 balance
- same-day refund vs. after the boundary: mock the clock at 00:59 and 01:01 Sarajevo time,
  in both winter and summer time, plus around the DST switch
- store-rejected / system-cancelled reservation refunds even after the boundary
- refund across a month boundary lands in the new month
- double refund of the same charge is impossible
- regular → donation refunds (same day only); donation → regular charges
- editing quantity or expiry after publishing is rejected by the API; other fields work
- two parallel charges with 1 credit left: exactly one succeeds
- second PENDING subscription request for the same month is rejected
- top-up is rejected without an active subscription; approved top-up adds to the current month
- auto-renew job creates the next month's request 2 days before the month starts, only once
- admin_note never appears in user-facing responses
- credits from a past month can't be used
