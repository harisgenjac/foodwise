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
| `restaurant-home/` | Restaurant dashboard (`/dashboard`) | `intro.html` (the centred intro under the strip: the brand title, the short text and the two main links, and its phone layout) | `client/src/components/dashboard/RestaurantIntro.tsx` |
| `restaurant-home/` | Restaurant dashboard (`/dashboard`) | `stores-carousel.html` (the store carousel under the intro: header, cards, mouse drag and arrows, and its phone layout; drag the cards in a browser) | `client/src/components/dashboard/StoreCarousel.tsx`, `client/src/components/common/DragCarousel.tsx` |
| `restaurant-home/` | Restaurant dashboard (`/dashboard`) | `how-it-works.html` (the three steps under the store carousel, with their illustrations, and the phone layout) | `client/src/components/dashboard/HowItWorks.tsx`, `client/src/components/dashboard/HowItWorksIllustrations.tsx` |
| `brand/` | Every page | `logo.svg` (the full mark), `logo-horizontal.svg` (the mark with the name, a reference only), `app-icon.svg` (the simplified mark on a green square, for small sizes); the palette in `brand/README.md` | `client/src/components/brand/Logo.tsx`, `client/src/index.css` (the colour tokens), `client/scripts/generate-icons.mjs` (favicon and app icons) |

The colours of every reference come from the palette in `brand/README.md`.
