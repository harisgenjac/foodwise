# Design references

Approved design references for the app's pages, one subfolder per page (for example
`restaurant-home/` for the restaurant dashboard). Open an SVG or HTML file in a browser to see it,
animation and hover states included.

Components must match these references (shapes, colours, timing). A change to an approved design
updates the reference in the same change as the component, so the two never disagree.

| Folder | Page | Files | Component |
|---|---|---|---|
| `restaurant-home/` | Restaurant home page (`/dashboard`) | `home.dc.html` (the desktop design, from a design tool: `<sc-for>` is a loop and `{{x}}` a value, the sample data is in its script at the bottom; it holds the exact colours, sizes, texts and SVG drawings) and `home.png` (its screenshot). Phones were not designed yet: the page stacks and wraps without breaking | `client/src/pages/RestaurantDashboardPage.tsx`, `client/src/components/dashboard/HomeHero.tsx`, `HomeIllustrations.tsx`, `HomeStoreSlider.tsx`, `client/src/components/common/InfoTooltip.tsx`, `DragCarousel.tsx`, the header search in `client/src/components/Header.tsx` |
| `brand/` | Every page | `logo.svg` (the full mark), `logo-horizontal.svg` (the mark with the name, a reference only), `app-icon.svg` (the simplified mark on a green square, for small sizes); the palette in `brand/README.md` | `client/src/components/brand/Logo.tsx`, `client/src/index.css` (the colour tokens), `client/scripts/generate-icons.mjs` (favicon and app icons) |

The colours of every reference come from the palette in `brand/README.md`.
