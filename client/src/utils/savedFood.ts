import type { Reservation } from '../types/index.js';

export interface SavedFoodTotals {
  kg: number;
  l: number;
  pieces: number;
}

// Sums the food handed over through Confirmed and Completed reservations.
// Weight and volume are normalised to kg and l; kom and pak are counted together as pieces.
export function getSavedFoodTotals(reservations: Reservation[]): SavedFoodTotals {
  const totals: SavedFoodTotals = { kg: 0, l: 0, pieces: 0 };

  for (const reservation of reservations) {
    if (reservation.status !== 'Confirmed' && reservation.status !== 'Completed') continue;
    const quantity = Number(reservation.quantity);

    switch (reservation.unit) {
      case 'kg':
        totals.kg += quantity;
        break;
      case 'g':
        totals.kg += quantity / 1000;
        break;
      case 'l':
        totals.l += quantity;
        break;
      case 'ml':
        totals.l += quantity / 1000;
        break;
      case 'kom':
      case 'pak':
        totals.pieces += quantity;
        break;
    }
  }

  return totals;
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
