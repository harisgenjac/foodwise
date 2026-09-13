export function validateProductFields(fields) {
  const { name, category, original_price, discounted_price, quantity, unit, expiry_date } = fields;
  
  if (!name || !category || !original_price || !discounted_price || !quantity || !unit || !expiry_date) {
    return "Sva polja su obavezna.";
  }
  
  return null;
}