export interface Product {
  id: number;
  store_id: number;
  name: string;
  description: string;
  category: string;
  original_price: string;
  discounted_price: string;
  quantity: string;
  unit: string;
  expiry_date: string;
  status: "Available" | "Sold" | "Expired" | "Removed";
  created_at: string;
  updated_at: string;
  available_quantity?: string;
  days_until_expiry?: number;
  business_name?: string;
  city?: string;
  // Only on GET /products/:id.
  store_address?: string | null;
  store_phone?: string | null;
  store_pickup_hours?: string | null;
}

export interface Reservation {
  id: number;
  product_id: number;
  restaurant_id: number;
  quantity: string;
  status: "Pending" | "Confirmed" | "Completed" | "Rejected" | "Cancelled";
  pickup_date: string;
  created_at: string;
  updated_at: string;
  product_name?: string;
  description?: string;
  discounted_price?: string;
  original_price?: string;
  category?: string;
  unit?: string;
  business_name?: string;
  city?: string;
  // Only on GET /reservations/:id, which returns both parties.
  store_id?: number;
  store_address?: string | null;
  store_phone?: string | null;
  store_pickup_hours?: string | null;
  restaurant_name?: string | null;
  restaurant_city?: string | null;
  restaurant_address?: string | null;
  restaurant_phone?: string | null;
}

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: "STORE" | "RESTAURANT";
  business_name?: string;
  logo_url?: string;
  address?: string;
  city?: string;
  opening_hours?: string;
  pickup_hours?: string;
  description?: string;
  phone?: string;
  created_at?: string;
  // Only on GET /users/stores (COUNT, so a string).
  active_products?: string;
}

export interface Favorites {
  id: number;
  restaurant_id: number;
  store_id: number;
  created_at: string;
}

// Add/edit product form state; every field is the raw input string.
export interface ProductFormValues {
  name: string;
  description: string;
  category: string;
  original_price: string;
  discounted_price: string;
  quantity: string;
  unit: string;
  expiry_date: string;
}

// One rejected row of a CSV product import; `row` is the line number in the file (the header is line 1).
export interface CsvRowError {
  row: number;
  error: string;
}

export interface ProductTemplate {
  id: number;
  store_id: number;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  original_price: string | null;
  discounted_price: string | null;
  quantity: string | null;
  shelf_life_days: number | null;
  created_at: string;
  updated_at: string;
}
