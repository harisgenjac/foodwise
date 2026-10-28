# Product: FoodWise ("Još vrijedi")

What the app is for, who uses it, how it behaves, and where it is going. No code details here; see `backend.md` and `frontend.md` for those.

## What it is

FoodWise is a B2B marketplace that connects **stores** and **restaurants** to sell food that is close to its expiry date at a reduced price. The goal is to cut food waste while giving stores some recovered revenue and restaurants cheaper ingredients. A humanitarian layer is being built on top of it (phase 1, donation offers, is live).

## Problem

- Stores regularly end up with food that will expire soon and has to be thrown away or sold at a loss.
- Restaurants constantly buy ingredients and want lower prices.
- Large amounts of still-edible food are wasted every day.

FoodWise connects the two sides directly, without intermediaries, phone calls or paperwork.

## Users and roles today

- **Store (`STORE`):** lists near-expiry products, receives reservation requests, accepts or rejects them, hands the food over and marks it picked up (or cancels a pickup the restaurant missed), sees notifications and its own statistics.
- **Restaurant (`RESTAURANT`):** browses and filters offers, opens store profiles, favorites stores, reserves a quantity and a pickup time, tracks its active reservations and their history, and its pickups.

- **Company headquarters (`COMPANY`, "Centrala"):** the head office of a store chain (for example Bingo). A company sits above its stores: the branches are ordinary store accounts that belong to the company. The headquarters creates, names, views and deactivates its branches and chooses and pays their plans and extra credits (see Credits). The headquarters never acts as a store: no products, reservations, pickups or donations and no credits of its own; it sees a branch's products and reservations read-only. Restaurants never see the headquarters, only the branches. It has an overview (company name, logo, number of active branches), the branch list and pages, the company profile (description and logo; the name is read-only, only an admin changes it) and its own profile (first name, last name, phone).
- **Branch (a `STORE` of a company):** works exactly like any store (products, reservations, pickups, donations, credits; until a later step it buys its own plan). Its name and city are changed only by its headquarters or an admin; on its own profile they are read-only ("Mijenja centrala" / "Managed by your company"). Address, phone, hours, description and logo are its own to edit. A branch without its own logo or description shows its company's, also after the company changes them; removing its own brings the company's back. A branch cannot leave its company. Its header shows "{branch} · dio {company}".
- **Admin (`ADMIN`):** runs the platform. Creates accounts, blocks and unblocks them, removes products and donations that break the rules, and sees platform-wide statistics and the audit log. An admin only has the admin panel: no marketplace, reservations, reports or donations.

Stores and restaurants are registered businesses with a profile (business name, city, address, phone, opening and pickup hours, description, logo). The city is chosen from a fixed list (no free text), so nearby offers and later store chains with branches per city can rely on it. The list covers the Sarajevo–Zenica–Tuzla area for now; adding a city is a small database change, and there is no admin screen for it.

### Accounts and the admin role

- **No public registration for stores and restaurants.** An admin creates every store, restaurant and admin account and enters only the account type, the email and a password, which the admin passes on to the user. That password is **temporary**: at the first login (and after an admin sets a new one) the user must choose their own, so no admin knows a user's current password. A store or restaurant must also fill in the required profile details: first and last name, business name, city, phone and address (marked with * on the form). Until both are done, every page except My profile is blurred behind a dialog that lists what is missing and links to My profile; only the profile menu (My profile, logout) and the language switch stay usable. A store without a business name is also hidden from restaurants (store list and marketplace). Every user can change their password on My profile at any time (current password, new password, new password again). The public register page is kept for a planned fourth kind of user (individuals, public kitchens, humanitarian organizations); today `/register` sends visitors to the login page with an explanation.
- The first admin is created with a command-line script; after that admins create each other in the app. All admins are equal. An admin can block another admin but never their own account, so at least one active admin always remains.
- **Companies:** an admin creates a company (store chain) together with its headquarters login: company name, email and a temporary password, as for other accounts. Company names are unique (not case-sensitive). There is one headquarters login per company for now (more can be added later). The admin sees every company with its headquarters email, number of branches and status, can edit the name and description, and sees the company's recent admin actions. Headquarters accounts cannot be created from the normal "New user" form.
- **Blocking** needs a reason. A blocked user is signed out at once and cannot log in; the login page shows the reason. A blocked store's products and profile disappear for restaurants, and its favorites entry is hidden. The blocked user's **pending** reservations (as a store and as a restaurant) are cancelled and the other side is notified (without the reason); **accepted** reservations stay so the food can still be handed over. Unblocking restores everything that was hidden.
- **Branches.** The headquarters creates a branch with its name, city, address, phone, a login email and a temporary password; at the first login the staff choose their own password and enter their names. The headquarters sees each branch's data, this month's numbers (active offers, pending reservations, pickups and food saved) and its products and reservations read-only, edits the name, city, address and phone, and sets a new password. An admin can also attach a store that is already on the platform to a company (for chains whose stores joined on their own); this cannot be undone.
- **Deactivating a branch** (by its headquarters or an admin) closes it without deleting anything: it disappears for restaurants with all its offers (the products themselves are not changed), its staff cannot log in ("This branch has been deactivated. Contact your company."), and its pending reservations are cancelled with the restaurants' credit refunded and a notification. It is refused while the branch still has accepted pickups, so no restaurant is left waiting for food. Reactivating brings it and its unexpired offers back. When an admin blocks, unblocks, deactivates or reactivates a branch, its headquarters is notified (the only notifications a headquarters gets besides announcements).
- **Chain label.** Restaurants see "dio {company}" / "part of {company}" next to a branch's name on store cards, the store page and product cards, so they know the store belongs to a chain. Nothing else changes for them.
- **Blocking a company** (reason required) blocks every user of the company at once (the headquarters and all branches): they are signed out, the login shows the company's reason, the branches disappear for restaurants, and the branches' pending reservations are cancelled as when a store is blocked (accepted ones stay). The accounts themselves are not marked blocked: unblocking the company restores them, except a branch an admin blocked on its own, which stays blocked. A user therefore counts as blocked when the account or its company is blocked.
- **Moderation:** an admin can remove any product or donation, with a required reason. The owner is notified and sees the reason in the notification. Removing a product cancels its pending reservations (the restaurants are notified); accepted ones stay.
- **Reservations:** an admin sees every reservation (filtered by status, by a user on either side, or by a search) and can cancel a **pending** or **accepted** one to settle a dispute, with a required reason that both the store and the restaurant see in their notification. Cancelling an accepted reservation puts its quantity back on offer, and a product it had sold out becomes available again unless it has expired. Picked-up, rejected and cancelled reservations cannot be changed.
- An admin can **edit a user's profile** (name, and for stores and restaurants the business data: name, city, phone, address, hours, description) with the same rules as the user's own profile form, for example to fix a typo or fill in a profile for a user who cannot. The logo stays the user's. Filling in a store's business name makes it visible to restaurants.
- **Announcements:** an admin sends a message to all stores (company headquarters included), all restaurants or everyone, with a Bosnian title and text and an optional English version (users with the English interface see it, or the Bosnian text when there is none). Every recipient gets a notification, and the announcement shows as a banner on every page until its optional last day, until an admin ends it, or until that user closes it. Blocked accounts and admins do not receive it, and accounts created later do not see older announcements. A sent announcement cannot be edited, only ended.
- An admin can set a new password for any account.
- **Audit log:** every admin action (account created, profile edited, password set, blocked, unblocked, product removed, donation removed, reservation cancelled, announcement sent or ended, credit decisions and adjustments, company created, edited, blocked or unblocked, branch deactivated, reactivated or attached) is recorded with the admin, the target, the reason and the time, and can be filtered by action.
- **Platform overview:** the key numbers on top (businesses, how many have a subscription this month, credits used, food saved), then what waits for the admin, which is only pending credit requests (shown only when there are any; reservations, products and accounts are not requests, the admin steps in from their lists only when needed), then one panel per area where the split is shown as a bar with counts: subscriptions by plan (with auto-renew, next month, pending), reservations by status, products by status, donations by status, and the impact of picked-up food (kg, l, pieces, value, restaurant savings).

## Core flows

1. A store adds a product: name, an optional description, category, original and discounted price, quantity and unit, expiry date. Every form marks its required fields with * and shows a red error on an empty required field before anything is sent.
2. A restaurant finds it in the marketplace (filters: name, category, expiry window, city from the list, distance; sorted by newest by default, or nearest first, soonest expiry, price or discount) or through a store profile (same sorts). A store can sort its own products by newest, soonest expiry or price, to spot what expires soon.
3. The restaurant reserves a quantity (partial reservations are allowed) and picks a pickup time between today and the product's expiry day. The reservation starts as `Pending` and the store is notified.
4. The store accepts (`Confirmed`) or rejects (`Rejected`). The restaurant is notified either way. Accepting cannot be undone, so the store first confirms a dialog that repeats the product, quantity, restaurant and pickup time. A restaurant can cancel (`Cancelled`) only while the reservation is still `Pending`; an accept and a cancel can never both succeed.
5. When accepted reservations cover the full quantity, the product is marked `Sold`.
6. When a product passes its expiry date it disappears from the marketplace and becomes `Expired`. Its `Pending` requests are cancelled automatically and the store and those restaurants are notified. `Confirmed` reservations stay `Confirmed`: the store already agreed to hand that food over.
7. Pickups: both sides have a "Pickups" page with today's accepted pickups (default), upcoming ones and the history of picked-up ones. When the restaurant collects the food, the store marks the reservation picked up (`Completed`) and the restaurant is notified. If the pickup day passes without a pickup, the reservation shows as late (at the top of Today) and the store can still mark it picked up or cancel it; cancelling puts the quantity back on offer (a sold-out product that has not expired becomes available again) and notifies the restaurant.

## Business rules (as implemented)

- Available quantity is the total minus pending, confirmed and picked-up reservations, so two restaurants can never reserve more than exists, even at the same instant. Fully reserved products are not shown in the marketplace. Card lists (the marketplace, my products, reservations, stores and a store's offers and reservations, donations, the picked-up history) load 12 at a time with "Load more" and show the full count; today's and upcoming pickups always show everything, so a late pickup is never hidden. Credit requests on My profile load 10 at a time. Admin tables show 20 rows per page with page numbers, and the page is part of the link. Some admin columns can be sorted by clicking their title (ascending, descending, off): users by creation date, products by price and expiry date, reservations by pickup time, donations by last day, credits by used, available, total and usage. The sort covers the whole list, not just the visible page, is part of the link too, and empty values always come last.
- A reservation keeps the price that applied when it was made. A store can edit only products that are still `Available`, and after publishing never their quantity or expiry date (the published offer cost a credit); name, description, category, prices and unit stay editable. A different quantity or date means a new product.
- Product input is validated on the server: known category and unit, prices and quantity above zero, discounted price not above the original, expiry date not in the past. Reservation quantity must be above zero.
- Emails are not case-sensitive (one account per address) and passwords need at least 8 characters. A store's or restaurant's profile requires first and last name, business name, city, phone and address.
- **Nearby offers.** A restaurant sees offers and stores near its own city (offers newest first by default, with "Nearest first" as a sort; the store list nearest first). The distance is the straight line between the two cities' centres (not addresses or roads), rounded to whole km, so the same city is 0 km and "up to 5 km" usually means the restaurant's own city. The distance filter offers 5, 10, 20 and 50 km and all cities, with 10 km as the default. The restaurant dashboard shows the three soonest-expiring offers within 10 km; when there are fewer, it fills the rest from 20 km, then 50 km, then all cities (nearer offers first), so it is never empty while offers exist somewhere. Choosing a specific city, "Favorites only" on the store list, or opening a store's profile shows those results whatever the radius. Several stores in range (later, branches of one chain) all show, nearest first. Under the results the restaurant sees how many more offers or stores lie further away, with a button for the next radius (5 → 10 → 20 → 50 → all cities).
- Business dates (expiry, "today", the midnight expiry run and the 07:00 reminders) follow Bosnia and Herzegovina time (`Europe/Sarajevo`), whatever the server's own time zone.
- CSV import is all or nothing: if any row is invalid, no product is created and the store sees every faulty row, so sending the corrected file again never creates duplicates. The file is checked first; the store then confirms how many products it imports and how many credits that uses (and how many are left) before anything is created or charged. Up to 500 products and 1MB per file; Excel files saved with `;` and a decimal comma are accepted, and so are the date formats Excel writes on its own (day first, as in Bosnia, unless the file is clearly in US month-first order).
- Product templates are private to the store that saved them. Saving a template under a name that already exists updates that template. A template remembers the shelf life as a number of days, so applying it sets the expiry date relative to today.
- Only available, unexpired products can be reserved, and a store cannot accept a reservation for a product whose expiry date has passed. Expiry is applied when the server starts and every midnight.
- Deleting a product is a soft delete and is blocked while it has active reservations. Reservation history is never erased.
- A reservation is visible only to the restaurant that made it and the store that owns the product.
- Only the store confirms a pickup (`Confirmed` → `Completed`); the restaurant only sees it. Only the store can cancel a confirmed reservation, and only once its pickup day has passed. A pickup counts as late only from the day after the pickup date; a passed pickup time on the same day is not late yet. This applies to both sides.
- Stores do not get a directory of restaurants: stores sell to whoever reserves, so only restaurants browse stores.
- The store list shows how many active offers each store has. Store profiles show public statistics to restaurants: active products, products sold, successful deliveries, and how many of the viewing restaurant's reservations there were picked up. A delivery counts only once the food is picked up (`Completed`): an accepted reservation can still become a missed pickup. The same rule applies to food saved and savings on the dashboards, the admin overview and the footer counter; the dashboards' "Confirmed reservations" card counts accepted ones.
- Reports (both roles, "Reports" in the sidebar) are CSV files for Excel for a chosen period (presets or custom dates, at most one year). They count only food that was actually picked up. Sales (store) / Purchases (restaurant): every pickup with the product, the other party, quantity, the agreed price, the full price, the total and the saving; the saving uses the product's current full price. Impact: per month, the number of pickups and partners, food saved in kg, l and pieces, its value and the savings. Column names follow the interface language.
- Notifications are in-app and refreshed by polling (every 50s and when the tab regains focus; no push channel yet). Each one links to the reservation or product it is about and is shown in the user's language. Stores are notified of new requests, cancellations by restaurants, a product selling out, a product expiring, and (reminder) a product that expires tomorrow while requests are still pending. Restaurants are notified when a reservation is accepted, rejected, cancelled by expiry, picked up, or cancelled by the store after a missed pickup, and (reminder) on the morning of a confirmed pickup. Each reminder is sent once. Users can mark notifications read (one or all) and delete them (one, or all read ones); the list keeps the 50 newest.

## Features available now

Admin panel (accounts created by admins, blocking, moderation of products and donations, cancelling disputed reservations, editing user profiles, platform announcements, platform overview, audit log); login for stores, restaurants and admins; product management; marketplace search and filters with nearby offers first (distance from the restaurant's city, a 5–50 km or all-cities radius); reservations with concurrency protection; a reservation history for restaurants (Active and History tabs, history grouped by the day it was made, a "Reserved" period filter, filters kept separately per tab); pickups page for both roles (today, upcoming, picked up) with pickup confirmation and cancelling missed pickups; notifications with links to details, reminders and deletion; automatic expiry handling; store list and store profiles with statistics and favorites ("favorites only" filter); reservation and product detail pages; product templates for stores (save a product's details once, then fill the add-product form from it and change only the date, quantity or price); CSV import of many products at once for stores; logo upload; downloadable CSV reports (sales or purchases, and monthly impact); donation offers for stores and restaurants (free or paid by a donor, meal details, moving a product to donations); monthly credits with subscription and top-up requests, admin approval, auto-renew and a Credits page; Bosnian and English interface; responsive layout; a footer on every page and the login page (platform-wide "food saved" counter for logged-in users, contact e-mail, app version; Help, Terms of use and Privacy are placeholders until their pages exist); demo data for presentations.

## Humanitarian module

### Phase 1 (live): donation offers

"Donate food" in the sidebar, for stores and restaurants alike:

- A business publishes a **donation offer** of one of two kinds:
  - **Free donation:** the food is given away.
  - **Paid donation:** the food is given at a lower **donation price** per unit, which a third party (a person or a company) will pay. The donation price must be below the food's value.
- Every donation records the food's **value per unit** (for later impact reports and donation certificates), the quantity and unit, and the last day it can be collected. An optional daily pickup window (from–until) can be added.
- Stores usually donate products. Restaurants usually donate **ready meals** counted in **portions**, and their form starts on that. Meals can list the 14 EU **allergens** and how they are served (hot, cold, frozen). Other categories never carry meal details.
- **Move to donations:** from My products or a product's page, a store moves the free quantity of an available, unexpired product into a donation. The donation copies the product's details and value. Reserved quantity stays with the restaurants' reservations. If nothing was reserved and everything was moved, the product leaves the marketplace. Otherwise its quantity drops by the donated amount, and if confirmed reservations then cover the rest it is sold out. Moving more of the same product later adds to its active donation (5 kg + 5 kg = one donation of 10 kg), as long as the donation type and donation price are the same; a different type or price is a separate donation.
- Donations past their last day become expired at midnight, like products (a donation moved from a product has the product's expiry date, so both expire together). Expired donations stay in the list marked as expired; they can no longer be edited, only deleted. Deleting hides a donation but keeps it in the database.
- When a store removes an active donation that came from one of its products, it chooses between **returning it to the offer** (the quantity goes back to the product, which is available for reservations again, even if it had been removed or sold out by the move) and **deleting it for good**. A product that has already expired cannot be returned.
- For now **only the donor sees its donations**: no one can claim or pay for them yet, so there are no donation notifications.

### Next phases

The platform grows from commercial surplus sales into one with a social purpose. It adds **three more kinds of users**:

- **Regular users:** people who want to pay for a donation without handling the food themselves.
- **Humanitarian organizations:** collect food for people in need.
- **Public kitchens:** prepare meals regularly and need a steady supply.

How it should work:

- **Stores** can publish offers intended for donation, free or at a symbolic price.
- **Organizations and public kitchens** apply to receive those offers.
- **Regular users** can pay for the value of a donation offer, funding it without picking it up; the organization collects it.
- **Restaurants** can also publish food (meals or ingredients) that others can pay for as a donation.
- **Event sponsorship:** stores and restaurants can sponsor humanitarian events or campaigns by donating food and other resources, outside of single everyday offers.

"Become a sponsor" in the sidebar still shows a "coming soon" page. Donation offers are a separate kind of record from marketplace products, so claims and payments will attach only to donations. Open design questions to settle before building the next phase: how organizations are verified, how claims (partial or whole) and payments for donations are handled and reported, and which notifications each party gets.

Ideas for the next phases (agreed as good directions, not yet scheduled):

1. **Suspended meal ("obrok na čekanju"):** a person pays for a restaurant's paid meal donation, and the person in need or an organization redeems it at the restaurant with a code or QR.
2. **Organization verification:** registration with an ID/JIB number and an uploaded registration document, admin approval and a "Verified" badge. Only verified organizations can claim donations. This is the planned fourth kind of user that registers publicly; the admin role it relies on exists now.
3. **Needs board:** organizations and public kitchens post what they need (category, amount, days, city) and get matching donations suggested. **Standing donations** (for example "leftover bread every evening") give public kitchens a steady supply.
4. **Automatic donation:** an opt-in rule that turns a product still unsold X hours before expiry into a free donation. Build it after the manual "Move to donations" proves itself.
5. **Food safety rules:** meat, dairy and fish only go to organizations that declare a fridge. Hot meals must be picked up within N hours. Allergens become mandatory for meals. Donors accept a liability disclaimer.
6. **Donation certificates:** a PDF "potvrda o donaciji" with the value in KM for accounting. Donations to registered humanitarian organizations can reduce tax up to a legal limit; check the FBiH, RS and Brčko District rules with an accountant before promising it.
7. **Corporate CSR budgets:** companies pre-fund a budget that pays for paid donations in their city, and get a monthly ESG/impact report (kg, meals, KM, CO₂).
8. **Revenue model:** no fee on free donations, a small transparent fee on paid ones (covering payment costs), paid impact reports and badges for brands, sponsorship packages for campaigns.
9. **Public impact and badges:** a "Humanitarian partner" badge on store profiles, public counters ("1,240 meals donated") and shareable social posts, so donating also has marketing value.
10. **Campaigns and events:** Ramadan iftars, Christmas, the start of the school year, natural disasters. Each is time-limited with a goal and a progress bar (fits the "Become a sponsor" page).
11. **Round-up:** restaurants round B2B purchases up to the next KM, and the difference goes into a donation fund.
12. **Thank-you loop:** after a pickup the organization sends a photo or thank-you that the donor sees.
13. **Volunteer drivers:** a later role that collects food from donors that organizations can't reach.

## Credits

Stores and restaurants pay with monthly credits (full spec: `docs/credits-spec.md`). Payment is offline for now: the user sends a request in the app, and an admin approves it once it is paid. Card payments, automatic approval and invoices come later.

- **My profile → Subscription and credits:** the current plan, period and balance, choosing a plan, auto-renew (with a tooltip that explains it), extra credits, and the status of every request. A pending request can be withdrawn. Turning auto-renew off keeps next month's plan, whether it is already approved or a request (the user's own or the automatic renewal) still waits; that plan just does not renew after that month. Withdrawing an automatic renewal request asks first, because it is not sent again for that month. Turned on in the last 2 days of the month, auto-renew sends next month's renewal request at once (even if the user withdrew an earlier one; not if the admin rejected it).
- A request keeps the credits and price of its plan or package from the moment it was sent; a later plan change never changes what the user was quoted or what the approval grants.
- The user is notified when their renewal request is sent, when a request expires undecided, and (once) when a renewal is not possible because the plan is no longer offered. While a subscription or top-up request waits, the credit banner says so instead of asking for a new one.
- Before a user sends a subscription request, a dialog explains in plain words what costs a credit, when a credit comes back, that credits expire with the month, and where to see the balance. The user picks this month only or auto-renew.
- **Credits page** (sidebar): this month's used, available, period and total, a usage bar (green up to 70%, orange to 90%, red from 90%) and when it was last refreshed. A yearly view shows usage by month (used vs unused; grey for months without a subscription and future months) and by product category.
- **Banners:**
  - No subscription: links to the subscription section.
  - No credits left: links to buying extra credits.
  - 80% used: says how many credits are left and links to the Credits page.
- The add-product form, the CSV import and the reservation dialog say how many credits the action uses and how many are left. A refusal for missing credits links to the right section of My profile.
- **Admin:**
  - A Credits overview of every store and restaurant (plan, used, available, total, pending requests), filterable by plan or "No subscription" (the platform overview's "Without subscription" opens it filtered) and sortable by the balance columns.
  - A requests page to approve or reject requests, with an internal note the user never sees. The sidebar shows how many requests are pending. A user's pending requests can also be approved or rejected from the Credits section of that user's admin page.
  - On a user's page: the credit history, and a manual +/− adjustment with a required reason.
  - Every decision and adjustment is in the audit log.

Rules:

- Plans of 20, 50 or 150 credits per **calendar month**, paid offline: the user sends a request and an admin approves it. Unused credits expire at the end of the month. Any plan can be chosen mid-month, at full price. A plan change applies from the next month.
- Top-ups of 10, 20 or 50 credits go into the current month and are possible **only with an active subscription for that month**. A user can have at most one pending top-up.
- A store pays 1 credit per published product (also 1 per product in a CSV import, all or nothing). A restaurant pays 1 credit per reservation. Donations are always free.
- Days and months change at 00:00 London time (01:00 in Sarajevo).
- Refunds:
  - Deleting a product, or moving all of it to donations, is refunded only on the same day and only if nothing was reserved. Rejected or cancelled requests don't count as reserved.
  - A restaurant cancelling its own pending reservation gets a refund only on the same day.
  - A store rejection, the expiry job and admin cancellations always refund.
  - A missed pickup (the store cancels a late reservation) is **not** refunded.
  - A refund after a month change goes into the new month, and counts only once the user has a subscription for that month.
  - Each charge is refunded at most once.
- Returning a fully moved donation to the offer charges 1 credit again only if the move refunded the product's credit (same day). If the move came after the charge day, the credit was never given back, so returning it is free. Every product costs at most one unrefunded credit at a time.
- Admins get a notification for every new pending request. Users get a notification when their request is approved or rejected. The admin's note is never shown to the user.
- Plans, prices and packages are database rows.

**Branches of a company** (step 2.3). Credits stay per branch: each branch has its own balance, and charges and refunds work exactly as for any store. What changes is who asks and pays: the headquarters.

- The headquarters' **Krediti i pretplate** page shows the company's totals for this month and every branch with its plan, used/total bar (the Credits page colours), next month's plan and auto-renew, with "Izaberi paket" and "Dodaj kredite" (the same dialogs and explanation a store sees, with the branch named in the title). The branch page has the same in a "Krediti i paket" card. The request history covers all branches.
- A branch never sends a request to the admin itself. It cannot choose a plan or switch auto-renew ("Paket plaća {company}" on My profile), but it can ask its headquarters for extra credits. The headquarters approves (the request then goes to the admin like any top-up, sent by the headquarters) or rejects it, optionally with a note the branch sees. The sidebar shows how many branch requests wait for the headquarters. A branch has at most one open top-up, whether it waits for the headquarters or the admin, and it needs this month's plan to ask.
- A branch's banners: without a plan, "{company} još nije izabrala paket za ovaj mjesec." (nothing to buy); out of credits or at 80%, a link to ask the headquarters for a top-up. The add-product form, the CSV import and refusals point there too.
- Notifications: the headquarters hears of a branch's top-up request and of the admin's decision (or expiry) on any of its branches' requests; the branch hears of its headquarters' answer and of the admin's decision. The admin's note is never shown to either.
- The admin sees a branch's requests as "Bingo d.o.o. → Bingo Tuzla" with who sent them (the headquarters or the renewal job) and a Company column in the credits overview; requests that never left the headquarters are not shown. Approval works as for any store.
- Auto-renew renews a branch like any store. Deactivated or blocked branches and branches of a blocked company are not renewed. Deactivating a branch withdraws its open requests and turns auto-renew off; reactivating does not turn it back on.
- Independent stores and restaurants are unchanged. Not yet: one shared credit pool for the whole company, invoices and card payments. The prices are placeholders for now: plans 15 / 30 / 75 KM, top-ups 8 / 15 / 35 KM.

## Other roadmap and ideas

- Public launch (deploy) with proper image storage.
- Store chains (in steps): 2.1 companies and the headquarters login (done); 2.2 branches managed by the headquarters, deactivation and the chain label for restaurants (done); 2.3 credits for branches asked for and paid by the headquarters (done); next, headquarters statistics and reports (2.4). A shared credit pool for a whole company is not planned yet. Filtering by company for restaurants is not planned yet.
- Nearby offers, next steps: store chains with branches per city; distances for donations; road distances or addresses only if straight-line city distances prove too rough. The city list grows beyond the Sarajevo–Zenica–Tuzla area as the market does.
- Admin role, next steps: send the login details (or a link to set the password) to a new user by email instead of the admin passing a temporary password on, and add "forgot password". Decided against for the admin role: problem reports (a support matter, not administration), managing categories, units and allergens in the database (they change rarely and are added in code), and login rate limiting (for now).
- Real product photos instead of category images.
- Pickup follow-ups: a QR or PIN code shown by the restaurant and checked by the store at handover; a restaurant reliability score from missed pickups (temporary limits after repeated no-shows); optional automatic cancelling of missed pickups after a few hours; a reminder an hour before the pickup; pickup time slots set by the store; a daily packing list per product for the store; a rating after pickup.
- Business ideas tied to pickups: charge the platform commission when a reservation is picked up (`Completed` is the moment the sale is real); a monthly impact report (kg of food saved, KM saved, CO₂ avoided) for stores and restaurants to use in ESG reporting and marketing (the CSV impact report covers kg and KM; CO₂ and a presentable PDF are still open).
- More reports, built when users ask for specific ones (the reports page is set up so new ones are added one at a time).
- Backend messages translated through keys instead of fixed English text (today a Bosnian-UI user sees server errors in English).
- Instant dropdown filtering in the marketplace (text and dropdown filters are both debounced today).

A store reliability score (accept versus reject ratio) was considered and declined for now.

## Market, language, tone

- Initial market is Bosnia and Herzegovina: prices are in KM and demo businesses are spread over Sarajevo, Visoko, Kakanj, Zenica and Tuzla.
- Interface languages: Bosnian (default) and English. Server messages (errors, success messages) are English only.
- Terminology: *prodavnica* = store, *restoran* = restaurant, *rezervacija* = reservation, *ponuda* = offer, *rok trajanja* = expiry date.
- Name: FoodWise (working Bosnian name "Još vrijedi"). Tone: practical, friendly, focused on reducing waste. Confirm the exact spelling shown in the UI header before using it in public material.

## Status

The commercial B2B platform is complete and tested. The humanitarian module's first phase (donation offers from stores and restaurants) is built; recipients, claims and payments are next. Deployment is deferred until the product is ready for public use.
