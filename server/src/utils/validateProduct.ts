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

export function validateProductFields(fields: ProductFields) {
  const { name, category, original_price, discounted_price, quantity, unit, expiry_date } = fields;
  
  if (!name || !category || !original_price || !discounted_price || !quantity || !unit || !expiry_date) {
    return "Sva polja su obavezna.";
  }
  
  return null;
}