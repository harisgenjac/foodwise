# FoodWise – development plan

Nov 3, 2026 · @Haris

## Overview and order

FoodWise moves to orders with a cart and delivery through Korpa, then gains new roles, organization verification, emails, a better mobile layout and a sponsorship section. The proposed order is below; each item is a section of this document.

1. **Mobile layout (responsive):** restaurants will order from their phones, so this comes first.
2. **Email notifications:** needed before "deliver now", so a store does not miss an order.
3. **Orders and delivery, phases 0–2:** cart, orders and delivery with a mock provider. Phase 0 (agreement and API specification for Korpa) starts now, in parallel.
4. **New roles and organization verification:** together, because an unverified organization cannot claim donations.
5. **Korpa live (phase 3):** as soon as Korpa builds the API to our specification.
6. **Sponsorship:** relies on roles, donations and verification.
7. **Mobile app and later plans** (delivery phase 4, card payments, own delivery app).

Items 3 and 4 can swap if the humanitarian part becomes more urgent, since they do not depend on each other.

## Orders and delivery

A restaurant orders from a cart with one store and chooses delivery (Korpa) or pickup; FoodWise only shows the price, time and statuses Korpa returns.

### Agreed rules

- An order always comes from one store.
- A store pays only credits (1 per published product) and has nothing to do with delivery. It sees the fulfilment method, the time and what to prepare.
- A restaurant pays no subscription and no credits.
- Delivery: Korpa sets the price, the time and the courier. On delivery the courier collects cash for the goods and the delivery together. Card payments come later.
- Pickup: the restaurant pays the store directly, as today.
- A store accepts or rejects individual items, unless the restaurant turned off "Accept partial fulfilment".
- On accepting, the store enters when the goods will be ready, and this goes to Korpa.
- Korpa builds the API to our specification. Later our own delivery app implements the same contract.

### Phase 0: Preparation

- [ ] Agreement with Korpa: commission, exclusivity, sandbox, coverage zones, how cash collected for goods is paid out to stores.
- [ ] API specification (OpenAPI): quote (price and time), creating a delivery with the ready time and the amount to collect, cancelling, webhooks for statuses (courier assigned, picked up, delivered, failed), HMAC signature and idempotency.

### Phase 1: Orders and cart (pickup only)

Design, decisions and PR split: `docs/orders-design.md` (agreed Nov 6, 2026). Decided there: a random 4-character order code (`#K7PM`) instead of a sequence, a server-side cart, at most 10 pending orders per restaurant, no partial quantities, single-item cancels or partial pickups.

- [ ] `orders` table above reservations (`order_id` on the reservation) and status history (who, when, source).
- [ ] Short order code (random, 4 characters, e.g. `#K7PM`).
- [ ] Cart: one store, "empty the cart?" dialog, no stock held, "Accept partial fulfilment" option.
- [ ] Submitting an order with all items at once, using the existing available-quantity protection.
- [ ] Accepting per item: rejected items return their quantity to the offer; if all are rejected, the order is `Rejected`.
- [ ] Restaurants without credits: remove charging, subscription and banners for restaurants, adjust the admin credits overview. Add a limit on pending orders. (Credits part done Nov 6, 2026; the pending-order limit comes with orders.)
- [ ] Adapt existing features: Pickups, details, notifications, reports, admin reservations and cancelling, blocking and moderation.
- [ ] E2E tests for the cart and orders.

### Phase 2: Delivery with a mock provider

- [ ] Exact addresses with coordinates for stores and restaurants, and a delivery address.
- [ ] `DeliveryProvider` interface and `MockProvider` following the phase 0 specification.
- [ ] Fulfilment methods per store: a store can turn delivery off.
- [ ] Choice in the cart: pickup (day and time) or delivery with price and time from the quote; no delivery when it is not available.
- [ ] Default preparation time in the store profile.
- [ ] Accepting with a ready time (15 / 30 / 60 min or an exact time, within opening hours and before expiry), the final amount and creating the delivery.
- [ ] Webhook and statuses: "courier picked up" means `Completed`; "delivered" and "failed" are notifications. Late logic only for pickup.
- [ ] Failure before pickup: the restaurant chooses to switch to pickup or cancel.
- [ ] SSE for live statuses instead of polling on order pages.
- [ ] Automatic rejection of orders the store does not accept in time.
- [ ] Pause receiving orders for a store.
- [ ] Packing list for today's orders, by ready time.
- [ ] E2E tests for the whole delivery flow with the mock.

### Phase 3: Korpa live

- [ ] `KorpaProvider` and testing on their sandbox.
- [ ] Delivery only in zones Korpa covers.
- [ ] Terms of use and privacy: sharing the restaurant's address and phone with Korpa.

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
- [ ] Claiming a donation: whole or partial quantity, statuses like reservations (pending, accepted, picked up, cancelled), with the same available-quantity protection.
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
- [ ] Document upload to cloud storage (Render has no persistent disk; the same task is already in the V2 backlog).
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
- Sending goes through a queue (a table with attempts and retries), so an email service error never breaks a reservation.
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

- [ ] Choose an email service (e.g. Resend, Postmark, Brevo) and a domain with SPF and DKIM records. Resend is chosen and built in; the domain and its DNS records are still to do.
- [x] Local testing with Mailpit, so nothing reaches real people during development.
- [x] Sending queue with retries and a log.
- [x] The first email: a new reservation to the store, with a link to it.
- [x] Templates for existing notifications (new order, accepted, rejected, cancelled, picked up, expiry, reminders, credits, admin announcements). All 32 notification types have an email (Nov 5, 2026).
- [x] One "Email notifications" switch on My profile for every user (on by default; off = no notification emails, queued ones skipped; system emails ignore it), linked from every notification email's footer.
- System emails that cannot be turned off (template property `system`):
  - [x] Forgot password: a link valid for 1 hour, once, the same answer for every email, a limit per email and per IP, every session signed out after the reset (Nov 5, 2026).
  - [x] Login details for a new user: an invitation email (72 hours) instead of a temporary password, which stays as an option; resend while the user never logged in, and a reset link sent by an admin (Nov 5, 2026).
  - [ ] Email confirmation (with public registration, see New roles).
- [ ] Emails for the new roles, verification and delivery.

## Mobile layout and mobile app

First a web app that looks and works well on a phone, then a PWA that can be installed and send push notifications, and only then a real mobile app.

### Step 1: Responsive web

The review and its findings per page are in `docs/mobile-review.md`, the reference for this step.

- [x] Review every page at phone width (about 375 px) and list the problems.
- [x] Navigation shell: a drawer below md for every role, and bottom navigation for stores and restaurants instead of the sidebar for the most used pages (store: Dashboard, My products, Reservations, Pickups, More; restaurant: Dashboard, Browse products, My reservations, Pickups, More); the window scrolls instead of the page area, 16 px side padding below sm.
- [x] Header on phones: 44 px buttons, the notification dropdown as a full-width panel.
- [x] Form controls: larger touch targets (at least 44 px) and phone-friendly forms: 16 px text and 44 px fields below sm, a numeric keyboard and a 44 px calendar button in the date input, category labels that wrap.
- [x] Modal: a maximum height with a scrolling body and buttons that stay visible.
- [x] Banners: compact announcement and credit banners on phones, a 44 px close button.
- [x] Tables become cards below md (orders, products, admin lists): one shared pattern, admin credit requests and credits first.
- [x] Filters on phones: the search stays, the other filters go behind a "Filters" button.
- [x] Small parts: dashboard stat labels, pagination and chip sizes, footer links (44 px targets).
- [ ] Pages: collapsible templates on Add product, and what is left outside Orders phase 1.
- [ ] Cart as a bottom sheet on phones.
- [ ] Playwright tests in a mobile viewport too for the main flows.

### Step 2: PWA

- [ ] Manifest and icons, so the app installs to the home screen.
- [ ] Push notifications through a service worker (new order, delivery status), which solves the polling problem.

### Step 3: Mobile app

- [ ] Expo (React Native) app using the same backend API.
- [ ] First the roles that use a phone most: restaurant (ordering) and store (accepting and the packing list).
- [ ] Publishing on the App Store and Google Play.

Step 3 makes sense only once the PWA shows that users need more than the web app.

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

## Ideas backlog (not scheduled)

Older ideas moved here from `product.md`. Agreed as possible directions, not planned or ordered.

### Platform

- [ ] Public launch (deploy) with proper image storage.
- [ ] Help, Terms of use and Privacy pages (the footer links are placeholders today).
- [ ] Real product photos instead of category images.

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

- **Problem reports in the admin role:** a support matter, not administration.
- **Managing categories, units and allergens in the database:** they change rarely and are added in code.
- **Store reliability score (accept versus reject ratio):** considered and declined for now.
