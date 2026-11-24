// The restaurant's order page (design/order-details/): the white cards and the hero's buttons.

// A white card (the products, the contact, the rating, the accordion), as on My orders.
export const PAGE_CARD =
  "rounded-[20px] border border-[#EEEDEB] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04),0_4px_16px_rgba(28,25,23,0.04)]";

// The hero's lime button ("Preuzet ću u prodavnici") and its white cancel button.
export const HERO_PRIMARY_BUTTON =
  "inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-lime px-[22px] text-[15px] font-extrabold text-brand-900 transition-colors hover:bg-[#D9F99D] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-60";
export const HERO_CANCEL_BUTTON =
  "inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-danger-200 bg-white px-[22px] text-[15px] font-bold text-danger-700 transition-colors hover:bg-danger-50 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-60";

// A round 44 px call button (the store, the courier).
export const CALL_BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-800 transition-colors hover:bg-brand-100 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300";

// A link inside a card (product, store, courier names).
export const CARD_LINK =
  "rounded-sm hover:underline hover:underline-offset-3 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300";
