export interface ProductFields {
  name: string;
  description?: string;
  category: string;
  original_price: string;
  discounted_price: string;
  quantity: string;
  unit: string;
  expiry_date: string;
}

const isPositiveNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
};

export function validateProductFields(fields: Partial<ProductFields>) {
  const { name, category, original_price, discounted_price, quantity, unit, expiry_date } = fields;

  if (!name || !category || !original_price || !discounted_price || !quantity || !unit || !expiry_date) {
    return "Sva polja su obavezna.";
  }

  if (!isPositiveNumber(original_price) || !isPositiveNumber(discounted_price) || !isPositiveNumber(quantity)) {
    return "Cijene i količina moraju biti pozitivni brojevi.";
  }

  if (Number(discounted_price) > Number(original_price)) {
    return "Snižena cijena ne može biti veća od originalne.";
  }

  if (Number.isNaN(Date.parse(expiry_date))) {
    return "Datum isteka nije ispravan.";
  }

  return null;
}
