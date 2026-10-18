# Frontend (`client/`)

Reference for working on the UI. The source of truth is the code; exact route paths are in `src/App.tsx`.

## Stack

- React 19, Vite, TypeScript, Tailwind CSS (core utility classes only), `react-router-dom` 7
- `axios` (one configured instance), `react-hot-toast`, `react-i18next` + `i18next`
- Scripts: `npm run dev` (http://localhost:5173), `npm run build`, `npm run lint`, `npm run preview`. Type-check with `npx tsc` (the config sets `noEmit`; Vite does the bundling).
- `tsconfig`: `strict`, `module esnext`, `moduleResolution bundler`, `jsx react-jsx`, `lib` with `dom`, `types: ["vite/client"]`, `verbatimModuleSyntax`, `noEmit`, `allowJs`, `include: ["src"]`.
- No client tests exist.

## Layout

```
client/src/
├── main.tsx              imports i18n config, renders <AuthProvider><Toaster position="top-center" /><App /></AuthProvider>
├── App.tsx               BrowserRouter and all routes
├── api/axios.ts          axios instance: baseURL http://localhost:3000/api, withCredentials: true
├── context/AuthContext.tsx
├── components/           Header, Layout, Sidebar, LanguageSwitcher, LoadingSpinner, ProtectedRoute, PublicRoute
├── hooks/                useFetch.ts, useNotifications.ts
├── i18n/                 config.ts, locales/bs.json, locales/en.json
├── pages/                one file per screen (see below)
├── types/index.ts        shared interfaces
└── utils/                categories.ts, units.ts, categoryImages.ts
```

## Routing and layout

- `/login` and `/register` are wrapped in `PublicRoute` (redirects to `/dashboard` when logged in).
- Everything else is nested under `<ProtectedRoute><Layout /></ProtectedRoute>`, so the Header and Sidebar never render before auth is resolved. `Layout` holds `isSidebarOpen` and renders `<Header />`, `<Sidebar />` and `<main><Outlet /></main>`.
- `<main>` is the scroll container (`overflow-y-auto`). To scroll to top use `document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" })`, not `window.scrollTo`.
- Screens: Dashboard (router component that renders `StoreDashboardPage` or `RestaurantDashboardPage` by role), MyProducts, AddProduct, EditProduct, ProductDetails, Reservations (store), ReservationDetails, BrowseProducts (restaurant), MyReservations (restaurant), Stores, StoreDetails, Notifications, MyProfile, DonateFood and Sponsor ("coming soon" placeholders, not translated).
- Link paths seen in code: `/my-products`, `/add-product`, `/edit-product/:id`, `/reservations`, `/browse-products`, `/my-reservations`, `/stores`, `/stores/:id`, `/notifications`, `/my-profile`, `/donate-food`, `/sponsor`, `/reservation/:id` (singular), product details (`/products/:id`). Confirm the registered paths in `App.tsx` before adding links.
- Header: logo, sidebar toggle, `LanguageSwitcher`, notification bell (unread badge, dropdown with the 5 newest and a link to `/notifications`, clicking one marks it read and navigates by role), profile dropdown (profile link, logout). The brand text in the Header currently reads "FoodWize"; confirm the intended spelling.
- Sidebar: role-based link list; collapsed state shows only the first letter of each label.

## Auth

`AuthContext` exposes `{ user, loading, login(email, password), logout() }`. On mount it calls `GET /users/me` (full profile, not `/auth/me`). `useAuth()` throws if used outside the provider. The cookie is httpOnly, so the client never touches the token. Role checks in UI use `user?.role === "STORE" | "RESTAURANT"`.

## Data fetching

- `useFetch<T>(url, dataKey, params)` returns `{ data: T[], loading, refetch }`. `dataKey` selects the array from the response (`"products"`, `"reservations"`, `"stores"`). It debounces every change of `url` or `JSON.stringify(params)` by 500ms; `refetch()` runs immediately. Always pass the type argument: `useFetch<Product>("/products/mine", "products", { name, status, category, expiryWithinDays })`. Known limitation: dropdown filters are debounced too (they should fetch instantly).
- `useNotifications()` returns `{ notifications, unreadCount, markAsRead, loading }`, refreshes every 50s, and exports its own `Notification` interface.
- Pages that do not use `useFetch` and why: single-record pages (`EditProductPage`, `ProductDetailsPage`, `ReservationDetailsPage`), `StoreDetailsPage` (one request returns store, products, stats and the caller's reservation count; only its "My reservations" tab uses `useFetch`), the dashboards (two parallel fetches into local state), `MyProfilePage`.
- Pattern for typed responses: `const data: Product[] = response.data.products; setList(data);`. Do not wrap an array response in another array.
- Query params are camelCase in state and snake_case on the wire where the backend expects it (`business_name`, `store_id`).

## Types (`types/index.ts`)

`User`, `Product`, `Reservation`, `Favorites`. Rules: `DECIMAL` columns (`original_price`, `discounted_price`, `quantity`, `available_quantity`) are `string`; ids are `number`; dates are ISO `string`; statuses are literal unions (`Product.status`, `Reservation.status`); fields that only appear through a JOIN or a specific endpoint are optional (`business_name?`, `city?`, `product_name?`, `available_quantity?`, `days_until_expiry?`). For numeric comparison use `parseFloat(p.available_quantity || "0")`. A single object that may not exist is `useState<T | null>(null)`; a list is `useState<T[]>([])`. Single-use shapes stay next to their page or hook (`StoreStats`, `MyReservationsCount` in `StoreDetailsPage`, `Notification` in `useNotifications`).

## TypeScript patterns

- `import type { ... }` for type-only imports; local imports end in `.js`/`.jsx` even though the files are `.ts`/`.tsx`.
- Inline handlers need no annotations (`onChange={(e) => setName(e.target.value)}`). A standalone handler does, for example `(e: React.ChangeEvent<HTMLInputElement>)`. For form submit use `React.SyntheticEvent<HTMLFormElement>` (`FormEvent` is deprecated in current `@types/react`).
- Props are typed with an interface or inline object: `({ children }: { children: React.ReactNode })`.
- Non-null assertion only where the app guarantees it: `useParams()` id inside a route that requires it, `document.getElementById("root")!`, `selectedProduct!` inside a handler that only runs with the modal open.
- `catch (err)`: use `axios.isAxiosError(err) ? err.response?.data?.error : null`, then fall back to a `t()` message. Server-provided messages are Bosnian and are shown as-is for now.
- Optional values used as an object key need a fallback: `categories[reservation.category || ""]`.

## i18n

- Config: `resources: { bs, en }` under the `translation` namespace, `lng: "bs"`, `fallbackLng: "bs"`, `interpolation.escapeValue: false`. `LanguageSwitcher` is a dropdown with flag images from `flagcdn.com` (emoji flags do not render on Windows) and is used in the Header and on the login/register pages.
- Key sections in both JSON files: `sidebar`, `header`, `auth`, `product`, `user`, `dashboard`, `filters`, `productStatus`, `reservationStatus`, `categories`, `units`, `myProducts`, `reservations`, `myReservations`, `notifications`, `store`.
- Same key name in different sections is fine (`product.editTitle`, `user.editTitle`). Reuse an existing key rather than duplicating it. Add a shared `common` section only when a string is repeated in many places.
- Categories, units and statuses are objects: `const categories = t("categories", { returnObjects: true }) as Record<string, string>;` then `categories[product.category] || product.category`. Same for `units`, `productStatus`, `reservationStatus`. Dropdown options come from `Object.entries(categories)`.
- Interpolating `t()` inside a template string needs `${}`: `` `${t("myReservations.placeholderMax")}: ${max}` ``.
- Some existing keys contain typos (`noNofiticationsTitle`, `addFavoriteSucces`, `deleteFavoriteSucces`). They are consistent across both JSON files and the code; renaming one means changing both files and every usage together.
- Raw codes that need no translation stay as they are (the unit code in the reservation modal label). `CATEGORY_IMAGES` is language-neutral and stays.
- `utils/categories.ts` and `utils/units.ts` still hold the old Bosnian label maps; the UI no longer reads them for display, but the keys mirror the backend codes.
- `DonateFoodPage` and `SponsorPage` are not translated yet. A few placeholders and fallback strings may still be hard-coded Bosnian; grep when touching a page.

## UI conventions

- Visual language: orange primary (`orange-500/600`, hover one step darker), gray neutrals, green for prices and confirm actions, red for delete/reject, white cards with `shadow` and `rounded-xl`, page container `max-w-5xl mx-auto`, card grids `grid-cols-1 md:grid-cols-3 gap-8`.
- Cards: 128px image area (`h-32`) on top with a status or category badge in the corner (`absolute top-3 right-3 bg-white/90 text-xs font-semibold px-2 py-1 rounded-full`), then title, description, details block, action buttons pinned to the bottom (`mt-auto`).
- Whole-card click navigates to the details page. Buttons inside a clickable card call `e.stopPropagation()`. Clickable elements carry `cursor-pointer`.
- Lists have a filter bar (text inputs plus selects). Text search is debounced through `useFetch`.
- Empty states distinguish "nothing exists yet" from "no results for these filters" using `hasActiveFilters`; the first can include a call to action, the second only suggests changing filters.
- Loading: `if (loading) return <LoadingSpinner />`. Success and error feedback uses `react-hot-toast` (`toast.success`, `toast.error`); profile and form pages also show inline error and success banners.
- Confirm dialogs and reservation dialogs are fixed overlay modals driven by `selectedProduct` (or a boolean on single-record pages).
- Tabs (`StoreDetailsPage`): `useState("products" | "reservations")`, the active tab has `border-b-2 border-orange-500`, content blocks render conditionally.
- Images: `CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Other` for products, one `RESERVATION_DEFAULT_IMAGE` for reservations, both in `utils/categoryImages.ts`. Store and user logos come from the backend `logo_url`, built as `http://localhost:3000${logo_url}`, with a 🏪 emoji and gradient fallback. Never hotlink images from Google, Amazon or stock-photo sites; use Unsplash or a fallback.
- Prices are shown in KM.
- Tailwind classes must be written in full (no string-built class names). A modifier such as `hover:` must be attached to the class with no space.

## Pending and known limitations

- API base URL and image URLs are hard-coded to `http://localhost:3000`; move to a Vite env variable before deployment.
- `useFetch` debounce should apply to text inputs only; dropdowns should fetch instantly.
- Translate `DonateFoodPage` and `SponsorPage` when they get real content, and switch server messages to translated keys once the backend returns them.
- Frontend has no automated tests.
