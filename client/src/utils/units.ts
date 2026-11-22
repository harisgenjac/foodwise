export const UNIT_LABELS: Record<string, string> = {
  kg: 'kilogram (kg)',
  g: 'gram (g)',
  l: 'litar (l)',
  ml: 'mililitar (ml)',
  kom: 'komad (kom)',
  pak: 'paket (pak)',
};

// How much one press of the store page's "+" or of its quantity stepper adds: 100 for grams and
// millilitres, 1 for every other unit. It is also the smallest amount the "+" puts in the cart.
export const quantityStep = (unit: string) => (unit === 'g' || unit === 'ml' ? 100 : 1);
