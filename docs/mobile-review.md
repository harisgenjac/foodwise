# Mobile review (375 / 390 px)

Review for "Mobile layout and mobile app", step 1, first task in `development-plan.md`: every page at phone width and the problems found. No code was changed. Written Nov 4, 2026.

## How it was checked

- Playwright (headless Chromium with mobile emulation and touch) logged in with the seed accounts (`market.centar@demo.com` store, `restoran.ukus@demo.com` restaurant, `admin@demo.com` admin, and `bingo@demo.com` headquarters as an extra) and opened every route in `App.tsx` at 375×812 and 390×812, plus the login page. Detail pages used the first link found on the list pages.
- Every page was screenshotted and measured: page width against the viewport, elements past the right edge, tables wider than their container, text cut off by `truncate`, interactive elements under 44 px, and form fields with text under 16 px.
- The pages were checked twice: as they are today (sidebar open), and with the sidebar hidden, to see each page's own problems once the navigation is fixed. The findings below come from the second pass unless they say otherwise.
- The shared components were also reviewed in code (`Layout`, `Sidebar`, `Header`, `Modal`, `AccountSetupGate`, `AnnouncementBanner`, `CreditBanner`, `FilterBar`, `Pagination`, `FormField`, `DateInput`, the tables).
- 375 and 390 px behave the same everywhere, so the findings are not split by width.
- **Limits:** this is Chromium, not Safari on an iPhone. The 16 px zoom rule and the `100vh` toolbar problem are iOS behaviours, inferred from the code. The edit-donation page (`/donate-food/:id/edit`) was not reached, because no list linked to it; it shares `DonationForm` with the new-donation page. The live preview panels on the add/edit product, donation and import pages were not reviewed in detail. They stack under the form below `lg`.

Priority: **high** = cannot be used on a phone, **medium** = usable but awkward, **low** = cosmetic.

## Shared parts (affect every page)

| Component | Problem | Priority |
|---|---|---|
| `Layout` + `Sidebar` | The sidebar has no phone mode. It opens at `w-64` by default (`sidebarOpen` in localStorage defaults to open), which leaves **119 px** for the page at 375 px, so every page is a narrow strip of broken text. Collapsed (`w-20`) it still takes 80 px, and with `p-6` that leaves about 247 px for content. | high |
| `Layout` | The page scrolls inside `<main>` (`h-screen` with `overflow-y-auto`), not the window. On iOS `100vh` is taller than the visible area, so the bottom of each page (footer, "Load more", last buttons) can sit under the browser toolbar. The address bar never collapses, and tapping the status bar does not scroll to the top. | medium |
| `Layout` | `p-6` (24 px) side padding on phones costs 16 px of width compared with a 16 px gutter. | low |
| `Header` | The sidebar toggle (36×36), the bell (36×36) and the language switcher (63×36) are under 44 px. | medium |
| `Header` | The notification dropdown (`w-96 max-w-[calc(100vw-2rem)]`, `right-0` of the bell) is cut off on the left: the title shows as "tifikacije" and each item loses its icon and first letters. It is anchored to the bell, not to the screen edge. | medium |
| `AnnouncementBanner` + `CreditBanner` | Together with the page header they fill most of the first screen. On Browse products the first offer starts at about 720 px of an 812 px screen. The banner's close button is 28×28. The credit banner's link is a 20 px high text link. | medium |
| `Modal` (`components/product/Modal.tsx`) | No `max-h` and no scrolling. A dialog taller than the screen is cut at the top and bottom with no way to reach the cut part. This happens on short phones (iPhone SE, 667 px) and whenever the keyboard is open. It affects every dialog built on it (reserve, donate product, subscribe, top-up, confirm, the admin and company dialogs). `EditProfileModal` (`max-h-[80vh]`) and `SubscribeModal` (an inner `max-h-64`) work around it themselves, so their buttons only appear after scrolling. At 812 px the reserve, confirm and subscribe dialogs fit. | medium |
| `AccountSetupGate` | Fits at phone width. A future bottom navigation must stay usable or be covered consistently, because the gate covers everything below the header (`top-16`, `bottom-0`). | low |
| `FormField`, selects, `DateInput`, `CitySelect` | Field text is `text-sm` (14 px), so iOS Safari zooms the page in when a field gets focus (13 fields on My profile, 7–9 on the product and donation forms, 2 on login). Fields are 42–43 px high, just under 44. | medium |
| `DateInput` | The calendar button is 28×28. The text field gets a full keyboard for dd/mm/yyyy (no `inputMode="numeric"`). | medium |
| `PickerField` (category buttons) | In two columns the labels are cut: "Mliječni pr…", "Pekarski pr…", "Smrznuta h…". Affects the add/edit product and donation forms. | medium |
| `FilterBar` | One column below `sm`, so 3–5 full-width fields (about 60 px each) sit above every list: about 300 px on Browse products and My products. | medium |
| Admin and company tables (`overflow-x-auto`) | Each table scrolls sideways inside its card with no hint that more columns exist. Content width in a 325 px card: Credits 800, Credit requests 609 (approve/reject sit in the hidden part), Company credits 564, Actions 443, Announcements 435, Products 433, Users 405, Donations 399, Companies 346, Company overview 350. | medium |
| `Pagination` | Buttons about 38 px high. The labels hide below `sm` (good). | low |
| Chips and pill buttons (date shortcuts, report presets, tabs, status filters) | 32–34 px high. | low |
| `Footer` | Links 20 px high and close together. | low |
| Dashboard stat cards (`components/dashboard`) | In two columns the labels are cut: "Aktivni…", "Na ček…", "Potvrđ…", "Spašen…". Affects the store and restaurant dashboards. | medium |

Fine at phone width: the header layout itself (logo, flag, bell, avatar fit at 375; the name and role hide below `md`), the profile dropdown, breadcrumbs, the reserve dialog at 812 px, the admin overview cards, the login page apart from the 14 px fields.

## Pages

Pages that "Orders and delivery" Phase 1 rebuilds are marked **(P1)**. For those, only problems the shared fixes will not cover are listed.

### Store

| Page | Problem | Priority |
|---|---|---|
| `/dashboard` | Stat card labels cut (shared). Otherwise fine. | — |
| `/my-products` | Filter card (4 fields) and sort above the list (shared `FilterBar`). Each card is about 460 px high because of the `h-36` image, so one product per screen. The three icon buttons (edit, donate, delete) are 40×40. | low |
| `/add-product`, `/edit-product/:id` | The templates list (6 templates, about 400 px) sits above the form, so the form starts on the third screen. Category labels cut (shared `PickerField`). | medium |
| `/import-products` | Fine apart from shared field sizes. The validation result table (rows with errors) uses `overflow-x-auto` like the admin tables; not filled in this review. | low |
| `/reservations` **(P1)** | Filter card with 3 fields above the list; cards about 460 px high. The Accept/Reject buttons work (40 px high). | low |
| `/pickups` **(P1)** | The three tabs wrap onto two rows ("Preuzeto" alone on the second). Late pickup cards are fine. | low |
| `/reservation/:id` **(P1)** | No problems of its own. | — |
| `/products/:id` | No problems of its own. | — |
| `/reports` | `ReportsTable` (3 rows: name with description, format, download): the description column is squeezed to a word per line and the download button is cut at the edge (content 394 px in 325). | medium |
| `/credits` | Fine. | — |
| `/my-profile` | Long single column (business data, hours, about, subscription, password), about 4 screens. Works. Fields at 14 px (shared). | low |
| `/donate-food`, `/donate-food/new` | Same as the product forms (category labels, fields). The list is fine. | low |
| `/sponsor`, `/notifications` | Fine. | — |

### Restaurant

| Page | Problem | Priority |
|---|---|---|
| `/dashboard` | Stat card labels cut (shared). | — |
| `/browse-products` **(P1)** | Five filters stacked (about 300 px). After the banners and header, the first offer starts below the first screen. On a card the store name and chain label are both truncated ("Zeleni…", "dio Kon…"), so the restaurant cannot see which store sells it. The store name link is 16 px high. Cards about 460 px high. | medium |
| `/stores`, `/stores/:id` | Filter card (shared). Store cards and the store page are fine. | low |
| `/my-reservations` **(P1)** | The Active/History tabs are fine. Filter card with 3 fields (shared); cards about 450 px high. | low |
| `/pickups` **(P1)** | Same as for stores. | low |
| `/products/:id` **(P1, reserve dialog becomes the cart)** | The reserve dialog fits at 812 px. Shorter screens and the keyboard depend on the `Modal` fix. | — |
| `/reservation/:id` **(P1)** | No problems of its own. | — |
| `/reports`, `/credits`, `/my-profile`, `/donate-food*`, `/sponsor`, `/notifications` | Same as for stores. | — |

### Admin

| Page | Problem | Priority |
|---|---|---|
| `/admin` | Fine (cards stack well). | — |
| `/admin/users`, `/admin/products`, `/admin/donations`, `/admin/actions`, `/admin/announcements`, `/admin/companies` | Tables wider than the card (shared). On Products and Donations the "Remove" action sits in the hidden part. | medium |
| `/admin/credits` | Table 800 px wide: only the user and the plan are visible; the balance columns need a long sideways scroll. | medium |
| `/admin/credit-requests` | Table 609 px wide: approve/reject sit off-screen. | medium |
| `/admin/reservations` **(P1, adapted in Phase 1)** | Table rows; only the shared table pattern is missing. | — |
| `/admin/users/:id` | The details card stacks well. Action buttons are full-size. `UserCreditsPanel` has a table (credit history) with the same sideways scroll. | low |
| `/admin/companies/:id` | Fine apart from its branch list table (shared). (Later found to be a list, not a table: it already stacks below `sm` and fits at 375 px, so it was left as it is.) | low |
| `/admin/users/new`, `/admin/companies/new`, `/admin/announcements` (form) | Fine apart from shared field sizes. The side info box stacks under the form. | low |

### Company headquarters (extra)

| Page | Problem | Priority |
|---|---|---|
| `/dashboard` (overview) | The branch table is 350 px in a 277 px area. | medium |
| `/company/credits` | The totals cards are fine. The branch table is 564 px in 277 px (plan, usage, next month, actions). | medium |
| `/company/reports` | Same `ReportsTable` as store reports. | medium |
| `/company/branches`, `/company/branches/:id`, `/company/branches/new`, `/company/profile` | Fine apart from shared parts. | low |

## Pages rebuilt in Phase 1

Browse products, the store's and restaurant's reservations, pickups, reservation details and the reserve dialog (which becomes the cart) will be rebuilt for orders. Their own problems are small: the stacked filters, the truncated store and chain label on product cards, tall cards and the wrapping pickup tabs. The rebuild should be designed mobile-first rather than fixed now. Everything else they suffer from (navigation, fields, dialogs, banners) is fixed once in the shared components.

## Proposed split into tasks

Shared first, in this order. Each is one small PR:

1. **Navigation shell** (`Layout`, `Sidebar`, `Header` toggle): the phone navigation (below), window scrolling or `100dvh` instead of `h-screen`, a 16 px gutter below `sm`. Fixes the only high problem; every other task depends on it.
2. **Header on phones:** 44 px buttons; the notification dropdown as a full-width panel under the header.
3. **Form controls:** 16 px text below `sm` and 44 px height in `FormField`, selects, `CitySelect` and `DateInput`; `inputMode` on numeric and date fields; a 44 px calendar button; `PickerField` labels that wrap instead of truncating.
4. **Modal:** `max-h` with the body scrolling and the buttons always visible. Then remove the workarounds in `EditProfileModal` and `SubscribeModal`.
5. **Banners:** a more compact `AnnouncementBanner` and `CreditBanner` on phones, a 44 px close button.
6. **Tables as cards below `md`:** one shared pattern, then the tables one at a time: admin credit requests and credits first (actions hidden today), then company credits and overview, `ReportsTable`, the remaining admin tables, `UserCreditsPanel`, the import error table.
7. **FilterBar on phones:** the search field stays, and the other filters go behind a "Filters" button (a panel or sheet) with a count of active filters.
8. **Small parts:** dashboard stat card labels, `Pagination` and chip sizes, footer links.
9. **Pages:** collapsible templates on Add product; anything left on pages outside Phase 1.

Then the plan's own items in the same step (bottom navigation, cart as a bottom sheet, mobile Playwright tests) follow as planned.

## Suggested patterns

**Navigation: a bottom bar for stores and restaurants, a drawer for everyone.** Below `md` the sidebar becomes a drawer that opens from the header button over the page (with a backdrop, closed after navigating), so every link of every role stays reachable. Stores and restaurants also get a bottom bar with their 4 most-used pages plus "More", which opens the drawer.
- **Why a bottom bar:** they are the roles that work from a phone. For a restaurant, Browse, Reservations/Orders, Pickups and Dashboard, with room for the cart from Phase 1. For a store, Dashboard, Add product, Reservations and Pickups. A bottom bar keeps those one thumb tap away.
- **Why only a drawer for admin and headquarters:** they have 6–12 links and use the app at a desk, so a drawer is enough and a bottom bar would hold only a third of their links.
- **Desktop:** the stored open/closed state stays a desktop setting. Phones never read it, so a phone cannot start with the sidebar open.

**Tables: cards below `md`.** Below `md` each row becomes a card: the main field as the title (name or user), the status pill top-right, 2–4 key values as label/value rows, and the row's actions as full-width buttons at the bottom. From `md` up the table stays as it is.
- **Why:** sideways scrolling hides exactly the columns people come for (actions, balances), gives no sign there is more, and fights the vertical scroll.
- **Same look as the rest of the app:** the app's other lists are already cards (products, reservations, pickups), so this matches them.
- **Sorting:** sortable headers become a "Sort by" select above the cards, as on the product lists.
