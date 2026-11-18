# Design references

Approved design references for the app's pages, one subfolder per page (for example
`restaurant-home/` for the restaurant dashboard). Open an SVG or HTML file in a browser to see it,
animation and hover states included.

Components must match these references (shapes, colours, timing). A change to an approved design
updates the reference in the same change as the component, so the two never disagree.

| Folder | Page | Files | Component |
|---|---|---|---|
| `restaurant-home/` | Restaurant dashboard (`/dashboard`) | `hero.svg` (md and up), `hero-mobile.svg` (phones) | `client/src/components/dashboard/RestaurantHero.tsx` |
| `restaurant-home/` | Restaurant dashboard (`/dashboard`) | `impact-strip.html` (the strip under the hero, its tooltips and the phone layout; the hero's road meets the strip, so on the page the hero's kerb is cut off) | `client/src/components/dashboard/ImpactStrip.tsx`, `client/src/components/common/InfoTooltip.tsx` |
| `restaurant-home/` | Restaurant dashboard (`/dashboard`) | `actions-and-stores.html` (the two main links and the store carousel under the strip, and their phone layout) | `client/src/components/dashboard/RestaurantActions.tsx`, `client/src/components/dashboard/StoreCarousel.tsx` |
