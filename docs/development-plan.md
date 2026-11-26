# Još vrijedi – development plan

Future work only: what is planned, ideas, open questions and what was decided against. The app as it is today is in [`product.md`](product.md); how it is built is in [`backend.md`](backend.md) and [`frontend.md`](frontend.md).

## Done

Finished work, described in `product.md`:

- **Mobile layout, step 1** (Nov 4–5, 2026): a drawer and a bottom bar, 44 px targets, phone-friendly forms, dialogs and banners, tables as cards, filters behind a button. The open findings are under Mobile layout below.
- **Email notifications, foundation** (Nov 5–6, 2026): a queue with retries, Mailpit for local testing, an email for every notification type, one switch on My profile, forgot password and invitation emails, Resend built in but not configured.
- **Orders and cart, delivery phase 1** (Nov 6–15, 2026): orders from one store with a short code, a server cart, per-item decisions with reasons and partial fulfilment, "Sold in shop", restaurants without credits, a pending-order limit, and the reservation era removed.
- **Order and store UI** (Nov 15–16, 2026): product images, order images, the store page with weekly hours and a cover (the cover was dropped again with the profile redesign, Nov 2026), and Search.
- **Delivery with a mock provider, phase 2** (Nov 16–18, 2026): pins on a map, store order settings and the pause, delivery in the cart, accepting with a ready time, the provider contract (`server/src/delivery/openapi.yaml`), webhooks and the InDelivery status, failure before and after the pickup, live updates (SSE; the missed-event gap on a fresh page load was fixed Nov 18), automatic rejection, the packing list and the e2e delivery flow.
- **Order page data** (Nov 24, 2026): the delivery contract and the mock report the courier's photo and vehicle, exact estimates on every event (with their history), the tracking page and failure codes; problem reports with the admin's "Prijave problema", and courier ratings sent to the delivery service.
- **Restaurant order page** (Nov 24, 2026): the redesigned `/orders/:id` for restaurants (`design/order-details/`): a status sentence and the steps in a green hero, the courier with photo, vehicle and a live countdown, the products and contacts, "Prijavi problem" and the courier rating on the page; the store's and the admin's order pages are unchanged.
- **Cleanup before the next phase** (Nov 18, 2026): the free-text hour columns dropped, unused code, files and i18n keys removed, a targeted code cleanup, one TypeScript baseline migration instead of 54, `npm run db:reset`, the new seeds (`seed`, `seed:demo`) with account helpers shared with the e2e seed, and these four docs.

## Orders and delivery

A restaurant orders from a cart with one store and chooses delivery or pickup; Još vrijedi only shows the price, time and statuses the delivery service returns. Pickup and the mock delivery work today; Korpa is next.

### Agreed rules

- An order always comes from one store.
- A store pays only credits (1 per published product) and has nothing to do with delivery. It sees the fulfilment method, the time and what to prepare.
- A restaurant pays no subscription and no credits.
- Delivery: Korpa sets the price, the time and the courier. On delivery the courier collects cash for the goods and the delivery together. Card payments come later.
- Pickup: the restaurant pays the store directly.
- On accepting, the store enters when the goods will be ready, and this goes to Korpa.
- Korpa builds the API to our specification (`server/src/delivery/openapi.yaml`: quote, creating a delivery with the ready time and the cash to collect, cancelling, status webhooks with an HMAC signature and idempotency, the courier's photo and vehicle, exact estimates on every event, the tracking page, failure codes, and the restaurant's courier rating). Later our own delivery app implements the same contract.
- Problem reports about orders are handled by the platform admin for now ("Prijave problema"); later they become the delivery service's customer support (decided Nov 24, 2026).

### Phase 0: Preparation

- [ ] Agreement with Korpa: commission, exclusivity, sandbox, coverage zones, how cash collected for goods is paid out to stores, and the API contract above (written by us as a proposal).

### Phase 3: Korpa live

- [ ] `KorpaProvider` and testing on their sandbox.
- [ ] Delivery only in zones Korpa covers.
- [ ] Terms of use and privacy: sharing the restaurant's address and phone with Korpa.
- [ ] Move the provider call out of the store's decision transaction (an outbox: commit the acceptance, then create the delivery and retry), so a slow provider never holds the order's locks. Fine for the in-memory mock today.
- [ ] Known limits of phase 2 to revisit: a ready time can only be today (an order accepted in the last minutes before midnight cannot get one), and after a failure before the pickup only the restaurant (or an admin) can close the order, not the store.

### Phase 4: Later

- [ ] Card payments (authorize, then charge the actual amount after acceptance).
- [ ] Restaurant reliability based on failed deliveries and missed pickups.
- [ ] QR or PIN at handover.
- [ ] Delivering donations to organizations and public kitchens.
- [ ] Own delivery app as a separate project with its own database and the same contract as Korpa ([Fleetbase](https://github.com/fleetbase/fleetbase) as a reference).

## New roles: individuals and humanitarian organizations

Two new roles register publicly (the `/register` page is already kept for this): individuals fund donations, and organizations claim them.

### Individual (`INDIVIDUAL`)

- Public registration: first name, last name, email, password, city. Email confirmation (depends on the email section).
- Sees active donations (free and paid) and campaigns, but not the marketplace.
- Pays the value of a paid donation without picking up the food; an organization picks it up.
- Sees the history of their payments and what was picked up from them.
- Spends no credits.

### Humanitarian organization (`ORGANIZATION`)

- Organization type: humanitarian organization or public kitchen (one role, a `type` field).
- Public registration with the organization's details, then verification (next section). Until verified it sees only My profile.
- Claims donations (whole or partial) and picks a pickup time within the donation's daily window.
- Declares whether it has a fridge or freezer (for meat, dairy and fish).
- Spends no credits; claiming donations is always free.

### Tasks

- [ ] Extend `Role` and authorization for `INDIVIDUAL` and `ORGANIZATION`.
- [ ] Public registration for both roles and email confirmation.
- [ ] Donation list for organizations and individuals (filters: city, category, donation type).
- [ ] Claiming a donation: whole or partial quantity, statuses like order items (pending, accepted, picked up, cancelled), with the same available-quantity protection.
- [ ] The donor (store or restaurant) accepts or rejects the claim and marks the pickup.
- [ ] Paid donation: an individual's payment is tied to the donation, and an organization claims it.
- [ ] Notifications for donors, organizations and individuals.
- [ ] Admin: overview of the new roles, blocking, moderation and audit log as for existing roles.
- [ ] Donation reports (quantity, value in KM) for donors and organizations.

Payments by individuals depend on the payment method, which is not decided yet (see Open questions).

## Verification of humanitarian organizations

Only an organization an admin has verified can claim donations, and it gets a "Verified" badge.

### Flow

1. The organization registers and fills in its details: name, type, ID/JIB number, city, address, phone, responsible person.
2. It attaches its registration document (PDF or image).
3. The request goes into the admin queue as "Pending"; admins get a notification.
4. An admin approves or rejects it, with a required reason when rejecting. The organization sees the reason and can correct its details and resubmit.
5. After approval the organization gets the "Verified" badge and access to donations.

### Tasks

- [ ] Organization fields and validation of the ID/JIB number (13 digits for JIB).
- [ ] Document upload to cloud storage (Render has no persistent disk; the same need as the public launch in the ideas backlog).
- [ ] Verification statuses: pending, approved, rejected, and resubmission.
- [ ] Admin page with the request queue, document preview, approval and rejection.
- [ ] Re-verification when an organization changes its name or ID/JIB.
- [ ] "Verified" badge on the profile and in lists.
- [ ] Notifications and emails for the decision.
- [ ] Audit log for every decision.
- [ ] An admin can revoke verification with a reason (active donation claims are cancelled).

## Email notifications

Every existing in-app notification can also go out by email, in the user's language, and the user chooses which kinds they want.

### Rules

- The email is sent from the same place the notification is created, so no event is left without an email.
- Sending goes through a queue (a table with attempts and retries), so an email service error never breaks an order.
- Every email links to the order, product or donation, and to the email settings.
- Bosnian and English templates, following the user's language.
- Urgent emails (new order, rejected order, failed delivery) go out at once; the rest can go as a daily digest.
- Decided Nov 5, 2026 (the foundation):
  - For now emails are only tested; no real email is sent. Without settings the server only logs each email (`log`); development and e2e use Mailpit (`smtp`).
  - The service is Resend, through its HTTP API (some hosts block SMTP ports). Its transport is built and tested with a mocked client but not configured until there is a domain.
  - `EMAIL_REDIRECT_TO` sends every email to one inbox with `[to: real@address]` in the subject; outside production the server refuses to start with Resend unless it is set.
  - Going live only changes environment variables (`EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, removing `EMAIL_REDIRECT_TO`), never code. Steps: "Enabling Resend later" in the README.
  - The users' language is not stored yet, so every email is in Bosnian until it is (both languages are written and tested; the queue keeps a language per email).
  - Emails hook into `createNotification`: a notification type with an email template gets its email queued in the same transaction.

### Tasks

- [ ] A domain for Resend with SPF and DKIM records (Resend is chosen and built in; going live only changes environment variables, see "Enabling Resend later" in the README).
- [ ] Email confirmation (with public registration, see New roles).
- [ ] Emails for the new roles and verification.

## Mobile layout and mobile app

First a web app that looks and works well on a phone (step 1, done except the items below), then a PWA that can be installed and send push notifications, and only then a real mobile app.

### Step 1: what is left

- [ ] My products cards: the edit, donate and delete icon buttons are 40×40 (below the 44 px target), and a card is about 460 px high (one product per screen).
- [ ] Cart as a bottom sheet on phones (today a cart bar opens `/cart`).
- [ ] The remaining main flows in a phone viewport too: the CSV import and donation specs still run only on desktop Chromium.
- [ ] Check on real devices: iOS Safari's toolbar, keyboard and `100vh` behaviour are emulated (WebKit with the iPhone 13 profile), not checked on a device.

### Step 2: PWA

- [ ] Manifest and icons, so the app installs to the home screen.
- [ ] Push notifications through a service worker (new order, delivery status), so a closed tab still hears of a new order.

### Step 3: Mobile app

- [ ] Expo (React Native) app using the same backend API.
- [ ] First the roles that use a phone most: restaurant (ordering) and store (accepting and the packing list).
- [ ] Publishing on the App Store and Google Play.

Step 3 makes sense only once the PWA shows that users need more than the web app.

## Code and tooling

- [ ] Lint the client's TypeScript: `client/eslint.config.js` only matches `*.{js,jsx}`, so no `.ts`/`.tsx` file is linted today. Waits for `typescript-eslint` to support TypeScript 7 (or a TS-aware linter such as oxlint; see Pending in `frontend.md`), and will surface warnings to fix.
- [ ] An ESLint setup for the server (it has none).

## Sponsorship

The "Become a sponsor" page becomes real: campaigns with a goal and a progress bar, which stores, restaurants and individuals support with food or payments.

### How it works

- A campaign is created by an admin or a verified organization (e.g. iftars during Ramadan, Christmas, the start of the school year, natural disasters).
- A campaign has a name, description, the organization it helps, a city, start and end dates, and a goal (e.g. 500 meals or 300 kg).
- Sponsors give food (a donation linked to the campaign) or resources (e.g. transport, packaging), and individuals pay for donations in the campaign.
- The progress bar and the number of sponsors show on the campaign page.
- Sponsors get a "Humanitarian partner" badge on their profile and a public counter (e.g. "1,240 meals donated").

### Tasks

- [ ] Campaigns table and linking donations to a campaign.
- [ ] Campaign pages (list and details) instead of the "coming soon" page.
- [ ] Contributing food (from the existing "Donate food") and contributing resources (description and quantity).
- [ ] Progress bar towards the goal.
- [ ] "Humanitarian partner" badge and public counters on profiles.
- [ ] Notifications and emails for a campaign's start, end and reached goal.
- [ ] Admin moderation of campaigns and audit log.

### Later

- [ ] Donation certificate (PDF with the value in KM); check tax relief with an accountant for FBiH, RS and Brčko District first.
- [ ] Corporate CSR budget and a monthly impact report (kg, meals, KM, CO₂).
- [ ] Sponsorship packages as a source of revenue.

## Open questions

- [ ] How and when does Korpa pay the store the cash the courier collects for goods, and does every store need a contract with Korpa?
- [ ] How do individuals pay for donations while there are no card payments (bank transfer with admin approval, as with credits)?
- [ ] Who pays for delivering a donation to an organization: the donor, a sponsor or the organization?
- [ ] Do public kitchens need something humanitarian organizations do not (e.g. standing donations), or is an organization type enough?
- [ ] Can an organization also buy food from the marketplace, or only claim donations?
- [ ] Which email service to use (price, free plan limit, domain)? Resend was chosen (Nov 5, 2026); its plan limit and the domain are still open.

## My profile follow-ups

- [ ] Warn before leaving a restaurant's or store's My profile with unsaved changes (the page already knows when its draft differs from what is saved: `hasChanges` in `components/businessProfile/draft.ts`).
- [ ] The same redesign for a company headquarters' and an admin's My profile (they keep the old page for now).

## Ideas backlog (not scheduled)

Older ideas moved here from `product.md`. Agreed as possible directions, not planned or ordered.

### Platform

- [ ] Public launch (deploy) with proper image storage.
- [ ] The footer's pages and accounts: O nama, Podrška, Kontakt, Postani partner, Uslovi korištenja, Politika privatnosti, Politika kolačića, Kako računamo uticaj, Pomoć, and the Instagram, Facebook, LinkedIn, TikTok and YouTube accounts (the footer's links are placeholders that do not navigate today; their `href`s go in the lists in `client/src/components/Footer.tsx`).
- [ ] Donation images: a donation gets its own image instead of the category photo.

### Emails

- [ ] Email settings per kind of notification (on/off for each), instead of the one switch.
- [ ] A daily digest for the less urgent emails.

### Marketplace and nearby offers

- [ ] Instant dropdown filtering in the marketplace (text and dropdown filters are both debounced today).
- [ ] Road distances or addresses for nearby offers, only if straight-line city distances prove too rough.
- [ ] Grow the city list beyond the Sarajevo–Zenica–Tuzla area as the market does.

### Pickups

- [ ] Optional automatic cancelling of missed pickups after a few hours.
- [ ] A reminder an hour before the pickup.
- [ ] Pickup time slots set by the store.
- [ ] A rating after pickup.
- [ ] Marking an order "Spakovano" on the packing list (stored, shared by the store's devices and live), if stores ask for more than printing.

### Store chains

- [ ] More than one headquarters login per company.
- [ ] One shared credit pool for the whole company (not planned yet).
- [ ] Filtering by company for restaurants (not planned yet).
- [ ] Headquarters overview and reports: charts beyond the usage bars, comparing periods, PDF reports, and company statistics for admins (not planned now).

### Credits

- [ ] Card payments, automatic approval and invoices for plans and top-ups (today a request is paid offline and an admin approves it).
- [ ] Final prices for plans and top-ups (today's are placeholders: plans 15 / 30 / 75 KM, top-ups 8 / 15 / 35 KM).

### Reports

- [ ] More reports, built one at a time when users ask for specific ones.
- [ ] A monthly impact report for stores and restaurants to use in ESG reporting and marketing: CO₂ avoided and a presentable PDF (the CSV impact report covers kg and KM).

### Humanitarian

- [ ] Suspended meal ("obrok na čekanju"): a person pays for a restaurant's paid meal donation, and the person in need or an organization redeems it at the restaurant with a code or QR.
- [ ] Needs board: organizations and public kitchens post what they need (category, amount, days, city) and get matching donations suggested.
- [ ] Standing donations (for example "leftover bread every evening") that give public kitchens a steady supply.
- [ ] Automatic donation: an opt-in rule that turns a product still unsold X hours before expiry into a free donation. Build it after the manual "Move to donations" proves itself.
- [ ] Food safety rules beyond the fridge declaration: hot meals must be picked up within N hours, allergens become mandatory for meals, donors accept a liability disclaimer.
- [ ] Distances for donations, as for nearby offers.
- [ ] Revenue from donations: no fee on free donations, a small transparent fee on paid ones (covering payment costs), paid impact reports and badges for brands.
- [ ] Shareable social posts about donations, so donating also has marketing value.
- [ ] Thank-you loop: after a pickup the organization sends a photo or thank-you that the donor sees.
- [ ] Volunteer drivers: a later role that collects food from donors that organizations can't reach.

## Decided against

- **Managing categories, units and allergens in the database:** they change rarely and are added in code.
- **Store reliability score (accept versus reject ratio):** considered and declined for now.
