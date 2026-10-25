// Page sizes: card grids load 12 at a time (fills 2- and 3-column rows); short lists and tables 10.
export const CARD_PAGE_SIZE = 12;
export const LIST_PAGE_SIZE = 10;

export type PageItem = number | "ellipsis";

// Page numbers to show around the current page: always the first and last, the current one with
// its neighbours, and an ellipsis for every gap. E.g. 1 … 4 5 6 … 20 (at most 7 items).
export function pageItems(current: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const shown = new Set([1, totalPages, current - 1, current, current + 1]);
  // Near either end, show five pages there so the row keeps the same width.
  if (current <= 4) [2, 3, 4, 5].forEach((page) => shown.add(page));
  if (current >= totalPages - 3) [1, 2, 3, 4].forEach((back) => shown.add(totalPages - back));

  const pages = [...shown].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items: PageItem[] = [];
  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous > 1) items.push("ellipsis");
    items.push(page);
  });
  return items;
}
