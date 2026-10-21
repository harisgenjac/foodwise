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
- **Restaurant (`RESTAURANT`):** browses and filters offers, opens store profiles, favorites stores, reserves a quantity and a pickup time, tracks reservation status and its pickups.

Both are registered businesses with a profile (business name, city, address, phone, opening and pickup hours, description, logo).

## Core flows

1. A store adds a product: name, description, category, original and discounted price, quantity and unit, expiry date.
2. A restaurant finds it in the marketplace (filters: category, max price, expiry window, name) or through a store profile.
3. The restaurant reserves a quantity (partial reservations are allowed) and picks a pickup time between today and the product's expiry day. The reservation starts as `Pending` and the store is notified.
4. The store accepts (`Confirmed`) or rejects (`Rejected`). The restaurant is notified either way. A restaurant can cancel (`Cancelled`) only while the reservation is still `Pending`; an accept and a cancel can never both succeed.
5. When accepted reservations cover the full quantity, the product is marked `Sold`.
6. When a product passes its expiry date it disappears from the marketplace and becomes `Expired`. Its `Pending` requests are cancelled automatically and the store and those restaurants are notified. `Confirmed` reservations stay `Confirmed`: the store already agreed to hand that food over.
7. Pickups: both sides have a "Pickups" page with today's accepted pickups (default), upcoming ones and the history of picked-up ones. When the restaurant collects the food, the store marks the reservation picked up (`Completed`) and the restaurant is notified. If the pickup day passes without a pickup, the reservation shows as late (at the top of Today) and the store can still mark it picked up or cancel it; cancelling puts the quantity back on offer (a sold-out product that has not expired becomes available again) and notifies the restaurant.

## Business rules (as implemented)

- Available quantity is the total minus pending, confirmed and picked-up reservations, so two restaurants can never reserve more than exists, even at the same instant. Fully reserved products are not shown in the marketplace; the marketplace loads 24 offers at a time with "Load more".
- A reservation keeps the price that applied when it was made. A store can edit only products that are still `Available`, and never below the quantity already reserved; lowering it to exactly the confirmed quantity marks the product `Sold`.
- Product input is validated on the server: known category and unit, prices and quantity above zero, discounted price not above the original, expiry date not in the past. Reservation quantity must be above zero.
- Emails are not case-sensitive (one account per address) and passwords need at least 8 characters.
- Business dates (expiry, "today", the midnight expiry run and the 07:00 reminders) follow Bosnia and Herzegovina time (`Europe/Sarajevo`), whatever the server's own time zone.
- CSV import is all or nothing: if any row is invalid, no product is created and the store sees every faulty row, so sending the corrected file again never creates duplicates. Up to 500 products and 1MB per file; Excel files saved with `;` and a decimal comma are accepted, and so are the date formats Excel writes on its own (day first, as in Bosnia, unless the file is clearly in US month-first order).
- Product templates are private to the store that saved them. Saving a template under a name that already exists updates that template. A template remembers the shelf life as a number of days, so applying it sets the expiry date relative to today.
- Only available, unexpired products can be reserved, and a store cannot accept a reservation for a product whose expiry date has passed. Expiry is applied when the server starts and every midnight.
- Deleting a product is a soft delete and is blocked while it has active reservations. Reservation history is never erased.
- A reservation is visible only to the restaurant that made it and the store that owns the product.
- Only the store confirms a pickup (`Confirmed` → `Completed`); the restaurant only sees it. Only the store can cancel a confirmed reservation, and only once its pickup day has passed. A pickup counts as late only from the day after the pickup date; a passed pickup time on the same day is not late yet. This applies to both sides.
- Stores do not get a directory of restaurants: stores sell to whoever reserves, so only restaurants browse stores.
- The store list shows how many active offers each store has. Store profiles show public statistics to restaurants: active products, products sold, successful (confirmed) deliveries, and how many reservations the viewing restaurant has made there.
- Reports (both roles, "Reports" in the sidebar) are CSV files for Excel for a chosen period (presets or custom dates, at most one year). They count only food that was actually picked up. Sales (store) / Purchases (restaurant): every pickup with the product, the other party, quantity, the agreed price, the full price, the total and the saving; the saving uses the product's current full price. Impact: per month, the number of pickups and partners, food saved in kg, l and pieces, its value and the savings. Column names follow the interface language.
- Notifications are in-app and refreshed by polling (every 50s and when the tab regains focus; no push channel yet). Each one links to the reservation or product it is about and is shown in the user's language. Stores are notified of new requests, cancellations by restaurants, a product selling out, a product expiring, and (reminder) a product that expires tomorrow while requests are still pending. Restaurants are notified when a reservation is accepted, rejected, cancelled by expiry, picked up, or cancelled by the store after a missed pickup, and (reminder) on the morning of a confirmed pickup. Each reminder is sent once. Users can mark notifications read (one or all) and delete them (one, or all read ones); the list keeps the 50 newest.

## Features available now

Registration and login with two roles; product management; marketplace search and filters; reservations with concurrency protection; pickups page for both roles (today, upcoming, picked up) with pickup confirmation and cancelling missed pickups; notifications with links to details, reminders and deletion; automatic expiry handling; store list and store profiles with statistics and favorites ("favorites only" filter); reservation and product detail pages; product templates for stores (save a product's details once, then fill the add-product form from it and change only the date, quantity or price); CSV import of many products at once for stores; logo upload; downloadable CSV reports (sales or purchases, and monthly impact); donation offers for stores and restaurants (free or paid by a donor, meal details, moving a product to donations); Bosnian and English interface; responsive layout; demo data for presentations.

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
2. **Organization verification:** registration with an ID/JIB number and an uploaded registration document, admin approval and a "Verified" badge. Only verified organizations can claim donations.
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

## Other roadmap and ideas

- Public launch (deploy) with proper image storage.
- Real product photos instead of category images.
- Pickup follow-ups: a QR or PIN code shown by the restaurant and checked by the store at handover; a restaurant reliability score from missed pickups (temporary limits after repeated no-shows); optional automatic cancelling of missed pickups after a few hours; a reminder an hour before the pickup; pickup time slots set by the store; a daily packing list per product for the store; a rating after pickup.
- Business ideas tied to pickups: charge the platform commission when a reservation is picked up (`Completed` is the moment the sale is real); a monthly impact report (kg of food saved, KM saved, CO₂ avoided) for stores and restaurants to use in ESG reporting and marketing (the CSV impact report covers kg and KM; CO₂ and a presentable PDF are still open).
- More reports, built when users ask for specific ones (the reports page is set up so new ones are added one at a time).
- Backend messages translated through keys instead of fixed Bosnian text.
- Instant dropdown filtering in the marketplace (text and dropdown filters are both debounced today).

A store reliability score (accept versus reject ratio) was considered and declined for now.

## Market, language, tone

- Initial market is Bosnia and Herzegovina: prices are in KM and demo data uses cities such as Sarajevo, Tuzla and Mostar.
- Interface languages: Bosnian (default) and English. Server messages are currently Bosnian only.
- Terminology: *prodavnica* = store, *restoran* = restaurant, *rezervacija* = reservation, *ponuda* = offer, *rok trajanja* = expiry date.
- Name: FoodWise (working Bosnian name "Još vrijedi"). Tone: practical, friendly, focused on reducing waste. Confirm the exact spelling shown in the UI header before using it in public material.

## Status

The commercial B2B platform is complete and tested. The humanitarian module's first phase (donation offers from stores and restaurants) is built; recipients, claims and payments are next. Deployment is deferred until the product is ready for public use.
