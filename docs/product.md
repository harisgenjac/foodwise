# Product: FoodWise ("Još vrijedi")

What the app is for, who uses it, how it behaves, and where it is going. No code details here; see `backend.md` and `frontend.md` for those.

## What it is

FoodWise is a B2B marketplace that connects **stores** and **restaurants** to sell food that is close to its expiry date at a reduced price. The goal is to cut food waste while giving stores some recovered revenue and restaurants cheaper ingredients. A humanitarian layer is planned on top of it.

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
- Notifications are in-app and refreshed by polling (every 50s and when the tab regains focus; no push channel yet). Each one links to the reservation or product it is about and is shown in the user's language. Stores are notified of new requests, cancellations by restaurants, a product selling out, a product expiring, and (reminder) a product that expires tomorrow while requests are still pending. Restaurants are notified when a reservation is accepted, rejected, cancelled by expiry, picked up, or cancelled by the store after a missed pickup, and (reminder) on the morning of a confirmed pickup. Each reminder is sent once. Users can mark notifications read (one or all) and delete them (one, or all read ones); the list keeps the 50 newest.

## Features available now

Registration and login with two roles; product management; marketplace search and filters; reservations with concurrency protection; pickups page for both roles (today, upcoming, picked up) with pickup confirmation and cancelling missed pickups; notifications with links to details, reminders and deletion; automatic expiry handling; store list and store profiles with statistics and favorites ("favorites only" filter); reservation and product detail pages; product templates for stores (save a product's details once, then fill the add-product form from it and change only the date, quantity or price); CSV import of many products at once for stores; logo upload; Bosnian and English interface; responsive layout; demo data for presentations.

## Planned: humanitarian module

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

The sidebar already has "Donate food" and "Become a sponsor" entries that currently show a "coming soon" page. Open design questions to settle before building: how organizations are verified, how payments for donations are handled and reported, how donation offers differ from commercial offers in the data model and in the UI, and which notifications each party gets.

## Other roadmap and ideas

- Public launch (deploy) with proper image storage.
- Real product photos instead of category images.
- Pickup follow-ups: a QR or PIN code shown by the restaurant and checked by the store at handover; a restaurant reliability score from missed pickups (temporary limits after repeated no-shows); optional automatic cancelling of missed pickups after a few hours; a reminder an hour before the pickup; pickup time slots set by the store; a daily packing list per product for the store; a rating after pickup.
- Business ideas tied to pickups: charge the platform commission when a reservation is picked up (`Completed` is the moment the sale is real); a monthly impact report (kg of food saved, KM saved, CO₂ avoided) for stores and restaurants to use in ESG reporting and marketing.
- Backend messages translated through keys instead of fixed Bosnian text.
- Instant dropdown filtering in the marketplace (text and dropdown filters are both debounced today).

A store reliability score (accept versus reject ratio) was considered and declined for now.

## Market, language, tone

- Initial market is Bosnia and Herzegovina: prices are in KM and demo data uses cities such as Sarajevo, Tuzla and Mostar.
- Interface languages: Bosnian (default) and English. Server messages are currently Bosnian only.
- Terminology: *prodavnica* = store, *restoran* = restaurant, *rezervacija* = reservation, *ponuda* = offer, *rok trajanja* = expiry date.
- Name: FoodWise (working Bosnian name "Još vrijedi"). Tone: practical, friendly, focused on reducing waste. Confirm the exact spelling shown in the UI header before using it in public material.

## Status

The commercial B2B platform is complete and tested. The humanitarian module is in planning. Deployment is deferred until the product is ready for public use.
