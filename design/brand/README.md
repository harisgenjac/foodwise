# Brand: Još vrijedi

The app's name is **Još vrijedi**, the same in both languages (the brand, never translated). It
replaced the old working name in November 2026.

## Logo

| File | What it is | Where the app uses it |
|---|---|---|
| `logo.svg` | The full mark: a green arrow over food held in an open hand | `Logo variant="mark"`: the header on phones and with the sidebar collapsed, the login page (large) |
| `logo-horizontal.svg` | The mark with the name "Još vrijedi" ("Još" #166534, "vrijedi" #C2410C) | A reference only: `Logo variant="full"` draws the mark and writes the name as real text in the app font, bold, in the same two colours (header with the sidebar open, phone drawer, 404 page, login form on phones) |
| `app-icon.svg` | The simplified mark (arrow, tomato, hand) on a green square, readable at 16 px | `Logo variant="icon"`; the favicon and app icons (`client/public/`), generated with `npm run icons` in `client/` |

The logo keeps its own illustration colours (the tomato #E4572E is the one colour outside the
palette). Emails show no logo: their header is the name as text in brand-800.

## Palette (palette A: fresh and trustworthy)

The tokens are defined in `client/src/index.css` (Tailwind `@theme`); Tailwind's own colours are
switched off, so components use only these. Rule of thumb: about 60% neutral, 30% brand, 10% accent,
and one primary button per screen.

| Token | Hex | Use |
|---|---|---|
| `brand-50` / `brand-100` | #F0FDF4 / #DCFCE7 | Light brand backgrounds (active navigation, chips) |
| `brand-200` | #BBF7D0 | Light text on dark green (impact strip, tooltip title) |
| `brand-800` | #166534 | The main colour: primary buttons, active navigation, links, focus rings, the impact strip, key headings; secondary buttons are white with a brand-800 border and text |
| `brand-900` | #14532D | Hover of brand-800 |
| `brand-950` | #052E16 | Tooltip card on the impact strip |
| `accent-100` / `accent-200` | #FFEDD5 / #FED7AA | Soft backgrounds for discounts and highlights |
| `accent-700` | #C2410C | Prices, discount badges, highlights, "vrijedi" in the logo; never a main button |
| `neutral-50` | #FAFAF7 | Page background |
| white | #FFFFFF | Cards and surfaces |
| `neutral-200` | #E7E5E4 | Borders |
| `neutral-500` | #78716C | Muted text (the lightest text allowed on white) |
| `neutral-800` | #292524 | Body text |
| `success` | 100 #DCFCE7 / 800 #166534 | Done, confirmed, available: a soft badge, so it does not look like a button |
| `warning` | 50 #FFFBEB / 700 #B45309 | Pending, waiting |
| `danger` | 50 #FEF2F2 / 700 #B91C1C | Errors, rejected, "expires today" |
| `info` | 50 #F0F9FF / 700 #0369A1 | Neutral information |

Each token has the full 50–950 scale: brand and success are Tailwind's green, accent its orange,
neutral its stone (with a warmer 50), warning amber, danger red and info sky. Text on a soft
status background uses the 700 shade (800 for success) to pass WCAG AA (4.5:1). There is no teal.

Charts use brand for the main series, accent for the second, neutral for "unused" or "none", and
the status colours when they show statuses.
