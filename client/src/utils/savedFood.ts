// Food handed over through picked-up (Completed) reservations, as GET /dashboard/stats returns it:
// weight and volume normalised to kg and l, kom and pak counted together as pieces.
export interface SavedFoodTotals {
  kg: number;
  l: number;
  pieces: number;
}

const formatAmount = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

// Returns the non-zero totals as display strings, e.g. ["42.5 kg", "12 l", "30 kom"].
export function formatSavedFood(totals: SavedFoodTotals, piecesLabel: string): string[] {
  const parts: string[] = [];
  if (totals.kg > 0) parts.push(`${formatAmount(totals.kg)} kg`);
  if (totals.l > 0) parts.push(`${formatAmount(totals.l)} l`);
  if (totals.pieces > 0) parts.push(`${formatAmount(totals.pieces)} ${piecesLabel}`);
  return parts;
}
