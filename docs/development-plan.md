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
- A store accepts or rejects individual items, or accepts a smaller quantity (never more), each change with a reason, unless the restaurant turned off "Accept partial fulfilment" (then only the whole order is accepted or rejected). The restaurant does not confirm again; it is notified with the changes and the new total. The same option applies when the order is sent: lines with less stock go with what is left, sold-out lines stay in the cart.
- On accepting, the store enters when the goods will be ready, and this goes to Korpa.
- Korpa builds the API to our specification. Later our own delivery app implements the same contract.

### Phase 0: Preparation

- [ ] Agreement with Korpa: commission, exclusivity, sandbox, coverage zones, how cash collected for goods is paid out to stores.
- [x] API specification (OpenAPI): quote (price and time), creating a delivery with the ready time and the amount to collect, cancelling, webhooks for statuses (courier assigned, picked up, delivered, failed), HMAC signature and idempotency. (Nov 16, 2026: we wrote it ourselves in `docs/delivery-api.yaml` so phase 2 can start, as our proposal; it still has to be agreed with Korpa in the agreement above.)

### Phase 1: Orders and cart (pickup only)

**Done** (Nov 15, 2026): every task below is ticked, and the cleanup renamed `reservations` to `order_items` and removed the reservation-era leftovers (`orders-design.md`, section 11, PR 6).

Design, decisions and PR split: `docs/orders-design.md` (agreed Nov 6, 2026). Decided there: a random 4-character order code (`#K7PM`) instead of a sequence, a server-side cart, at most 10 pending orders per restaurant, a fulfilment method on the order (only pickup now), partial fulfilment over items and quantities with reasons (also at sending), "Sold in shop" for stock sold at the store's own till, and no single-item cancels or partial pickups.

- [x] `orders` table above reservations (`order_id` on the reservation), with a fulfilment method (pickup only for now), and status history (who, when, source) (Nov 10, 2026: the order model and `/api/orders` on the server; the screens come in the next PR).
- [x] "Sold in shop" (Nov 6, 2026): a store records an amount sold at its own till, which lowers the free quantity (no credit back, not an app sale, cannot be undone: a confirmation shows the amount and the free quantity before and after).
- [x] Check that every place that computes a product's free quantity counts shop sales (the marketplace, the product page, the sold-out status, the order stock checks, moving to donations and returning a donation to the offer already do). (Nov 15, 2026: every remaining-quantity computation goes through `services/stock.ts`; the store list's offer count now matches the marketplace, the admin's product list shows the free quantity, moving to donations never falls back to the published quantity, and expiry or an admin's removal records the shop's shortage like any freed Pending item. Management counts of active products stay by status.)
- [x] Short order code (random, 4 characters, e.g. `#K7PM`) (Nov 10, 2026: notifications, emails, the order lists and pages, and the store's code search).
- [x] Cart: one store, "empty the cart?" dialog, no stock held, "Accept partial fulfilment" option (Nov 13, 2026, orders PR 5: a server cart with live flags, the header cart, "Dodaj u korpu" and `/cart` with checkout).
- [x] Submitting an order with all items at once, using the existing available-quantity protection (Nov 13, 2026: the cart sends one order; lines not sent stay in the cart, and the confirmation lists every change).
- [x] Accepting per item: accept all, a smaller quantity or reject, with a reason; freed quantity returns to the offer; if all are rejected, the order is `Rejected` (Nov 10, 2026: the store's decision dialog with reasons and shop sales, the order pages for both sides).
- [x] Restaurants without credits: remove charging, subscription and banners for restaurants, adjust the admin credits overview. Add a limit on pending orders. (Credits part done Nov 6, 2026; the limit of 10 pending orders Nov 10, 2026.)
- [x] Adapt existing features: Pickups, details, notifications, reports, admin reservations and cancelling, blocking and moderation. (Nov 10, 2026: pickups, order details, notifications and emails, blocking, moderation and expiry work on orders; Nov 11, 2026, orders PR 4: the admin's orders, the headquarters' branch orders, statistics and reports.)
- [x] E2E tests for the cart and orders. (Nov 15, 2026: besides the specs each orders PR added, editing the cart and a late pickup date, a restaurant withdrawing an order and the store's code search, a missed pickup cancelled by the store, and the pending-order limit.)

### Before Phase 2: order and store UI

**Done** (Nov 16, 2026, PRs #101–#104), except dropping the old free-text hour columns, which waits until the businesses have entered weekly hours.

Agreed Nov 15, 2026. One-store orders made the category image and the flat product list stale, and the store page becomes the main place to order. These changes keep the existing look and components; layouts are designed for phones first and also work on desktop. Split into four PRs (product image, order image, store page, Search).

**Product image** (the category no longer decides the image)
- [x] A product has its own image; the category never sets or changes it. A product without an image shows one generic product image. (Nov 15, 2026: `products.image_url`, the generic image as `ProductImage`'s fallback.)
- [x] Add product and Edit product: "Upload image" (JPG, PNG or WEBP, at most 5 MB, checked on the server too) or "Suggested images" (a dialog with the current category photos as one plain gallery; click to select, then "Select image"). No camera option for now. (Nov 15, 2026: `ProductImagePicker` and `SuggestedImagesModal`; `POST /api/products/images`.)
- [x] Uploads are stored like logos (local `uploads/`), behind one storage module that is easy to swap for cloud storage at the deploy. Replacing or removing an image deletes the old file (unless a template or another product still uses it). (Nov 15, 2026: `services/storage.ts`, also for logos; a daily job deletes uploads a form never saved.)
- [x] The image stays editable after publishing (unlike quantity and expiry). (Nov 15, 2026.)
- [x] Templates remember the image. CSV import gives products the generic image for now. (Nov 15, 2026.)
- [x] Existing products and templates get their category's suggested image once (migration); the seed gives demo products suggested images. Donations keep their current images. (Nov 15, 2026: migration `1793000000036`.)

**Order image** (an order can have many products)
- [x] Every place that shows an order uses the other party's logo: a restaurant sees the store's logo, a store sees the restaurant's logo (order cards, order history rows, Pickups, order details, the dashboards' recent orders; notifications show icons, not images). (Nov 15, 2026: `party_logo_url` on the lists and pickups, `logo_url` on both parties of the order page; `OrderImage`.)
- [x] With no logo, or if it fails to load, one generic order illustration (the same for every order, no initials). (Nov 15, 2026.)
- [x] The order card shows small thumbnails of the first 2–3 products next to the title. (Nov 15, 2026: `OrderItemThumbnails`, only on the order card; the history row and the pickup card are too dense.)

**Store page** (the most important page now)
- [x] Structured opening and pickup hours: per weekday closed or one from–to interval, edited on My profile; the old free text stays as a hint until the store saves structured hours, then the text columns are dropped. (Nov 16, 2026: `users.opening_schedule` / `pickup_schedule`, `WeeklyHoursEditor` on My profile and in the admin's profile dialog; the old text columns are still there.)
- [x] Header: a cover image uploaded on My profile (same rules as the product upload, a plain fallback without one), logo, name, address, pickup hours and "Open now / Closed". (Nov 16, 2026: `POST/DELETE /api/users/me/cover`, `open_now` on the store page.)
- [x] Short stats: active offers, expiring today, biggest discount (they replace the old four stats). (Nov 16, 2026.)
- [x] Tabs Products and Information (address, opening and pickup hours, description, contact); the "My orders" tab goes away (orders stay on My orders). (Nov 16, 2026.)
- [x] Products: search within the store, category chips, an "Expiring soon" section first, then products grouped by category. Each card has the image, discount, expiry, available quantity, price and a + button that turns into a quantity stepper. (Nov 16, 2026: `StoreProductCard`, `QuantityStepper`, `useAddToCart`.)
- [x] Cart: on phones a cart bar at the bottom ("Korpa · 3 proizvoda · 45,00 KM") that opens `/cart`; on desktop the cart as a panel on the right with checkout and "Accept partial fulfilment". Favorites stay on the store page. (Nov 16, 2026: `StoreCartBar`, `StoreCartPanel`.)

- [ ] Drop the free-text `opening_hours` and `pickup_hours` columns once the businesses have entered weekly hours (a migration; My profile and the admin's dialog then lose the hint).

**Search ("Pretraga")** (replaces "Browse products" for restaurants)
- [x] Results grouped by store: a header with the store's logo (or a generic store image), name, city and a link to the store page, and below it the matching products. (Nov 16, 2026: `GET /api/products/by-store`, `SearchPage`.)
- [x] Filters: text, city, category, expiring (today, tomorrow, 3 days) and sorting; empty and no-results states. (Nov 16, 2026; the nearby radius stays too.)
- [x] Adding to the cart from the results with a + button that turns into a quantity stepper; a different store than the cart's asks "Empty the cart?" as today. (Nov 16, 2026.)
- [x] The navigation item (sidebar and bottom bar) and the route are renamed; the old route redirects. (Nov 16, 2026: `/search`, "Pretraga".)

- [x] Tests for every part (unit and e2e, including the phone viewport) and the docs updated. (Nov 16, 2026: server and client tests and e2e specs on desktop and the iPhone project for each part.)

### Phase 2: Delivery with a mock provider

Agreed Nov 16, 2026: done as separate PRs, in this order: the provider, addresses, store settings (delivery on/off, preparation time, pause), the cart choice, accepting with a ready time, webhooks and failures, SSE, automatic rejection and the packing list, then the e2e flow.

- [x] Exact addresses with coordinates for stores and restaurants, and a delivery address. Coordinates come from a pin on a map (Leaflet with OpenStreetMap tiles) next to the typed address, not from geocoding. (Nov 16, 2026: `users.latitude`/`longitude` set on My profile or by an admin, optional with a reminder on the dashboards, at most 30 km from the profile's city. Decided: a restaurant has one address, its profile pin, which is its delivery address; the cart PR copies it onto the order when it is sent.)
- [x] `DeliveryProvider` interface and `MockProvider` following the phase 0 specification. (Nov 16, 2026: `server/src/delivery/`, with the webhook signature check and a simulated courier; not used by orders yet.)
- [x] Fulfilment methods per store: a store can turn delivery off. (Nov 16, 2026: `users.delivery_enabled`, the "Nudim dostavu" switch on My profile and in the admin's profile dialog; the cart PR offers delivery only when it is on.)
- [x] Choice in the cart: pickup (day and time) or delivery with price and time from the quote; no delivery when it is not available. (Nov 16, 2026: decided that a delivery is always for today, as soon as possible, quoted with the store's preparation time; not offered when the store turned delivery off, paused or is closed now, when either side has no pin, or outside the provider's zone. The order keeps the restaurant's address and pin, the quoted price as an estimate and the estimated delivery time; the final price comes when the delivery is created at acceptance, and the restaurant is told if it differs. A delivery order's `pickup_at` is the courier's estimated pickup until accepting sets the ready time.)
- [x] Default preparation time in the store profile. (Nov 16, 2026: `users.preparation_minutes`, 15/30/45/60/90/120 with 30 by default, on My profile and in the admin's dialog; accepting with a ready time will suggest it.)
- [x] Accepting with a ready time (15 / 30 / 60 min or an exact time, within opening hours and before expiry), the final amount and creating the delivery. (Nov 16, 2026: decided as buttons 15–120 min with the store's preparation time preselected, or an exact time today before closing. The acceptance quotes the accepted goods and creates the delivery in the `deliveries` table with the final price and the cash to collect. If creating it fails, the acceptance stands, the delivery is kept as FAILED with the reason and both sides get `DELIVERY_FAILED`; the restaurant's choice to switch to pickup or cancel comes with "Failure before pickup". Before Korpa goes live the provider call should move out of the decision's transaction (an outbox).)
- [x] Webhook and statuses: "courier picked up" means `Completed`; "delivered" and "failed" are notifications. Late logic only for pickup. (Nov 17, 2026: `POST /api/delivery/webhooks/:provider` with the signature over the raw body and events stored once per `event_id`, out-of-order ones ignored. Decided: the pickup itself sends no notification (the order page shows it); "courier assigned" keeps the courier's name and phone; a failure after the pickup notifies both sides and the order stays `Completed` (settled with the provider or the admin); a provider's cancel before the pickup counts as a failure; the store can no longer mark a delivery order picked up; an admin's cancel cancels the delivery with the provider. A dev-only route and an order-page panel play the mock courier through the same webhook path.)
- [x] Failure before pickup: the restaurant chooses to switch to pickup or cancel. (Nov 17, 2026: also after a delivery that could not be booked at acceptance. Switching asks for a pickup day and time like the cart and turns the order into an ordinary pickup order; cancelling returns the quantity to the offer; the store is notified either way. Known limit: until the restaurant chooses, the store cannot close the order itself; only an admin can cancel it.)
- [x] SSE for live statuses instead of polling on order pages. (Nov 17, 2026: `GET /api/events`, fed by database triggers through Postgres `LISTEN/NOTIFY`, so an event goes out only after its transaction commits and works with several server instances. Decided: an event only says which order changed (or that a notification arrived), and the page loads it through the API; the order page, My orders, the store's Orders and Pickups update live, and so does the notification bell, whose 50 s polling stays as a fallback.)
- [ ] Automatic rejection of orders the store does not accept in time.
- [x] Pause receiving orders for a store. (Nov 16, 2026: decided as a switch with an optional end: 30 min, 1, 2 or 4 hours, to the end of the day or until switched off, from My profile and a card on the store's dashboard, also by an admin. The products stay visible and in carts with a "not taking orders" note; sending is refused. Not for a headquarters on its branches.)
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
  - [x] Login details for a new user: an invitation email (72 hours) instead of a temporary password, which stays as an option; resend while the user never logged in, and a reset link sent by an admin (Nov 5, 2026). The same choice for a new company's headquarters login and for branches a headquarters creates (Nov 6, 2026).
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
- [x] Real product photos instead of category images (Nov 15, 2026: see "Before Phase 2: order and store UI").
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
