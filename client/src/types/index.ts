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
  // Set when the store marks the reservation as picked up (Completed).
  picked_up_at?: string | null;
  // Confirmed and the pickup day is before today (a passed time on the same day is not late); on GET /reservations/store, /reservations/:id and the pickups list.
  is_overdue?: boolean;
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
  // Only on GET /reservations/pickups: whole days since a missed pickup date, and the other party's contact.
  days_overdue?: number;
  party_phone?: string | null;
  party_address?: string | null;
  party_pickup_hours?: string | null;
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

export type DonationType = "FREE" | "SPONSORED";

// A donation offer from a store or restaurant (GET /donations/mine, /donations/:id).
export interface DonationOffer {
  id: number;
  donor_id: number;
  // Set when the donation was moved from a marketplace product.
  source_product_id: number | null;
  donation_type: DonationType;
  name: string;
  description: string | null;
  category: string;
  quantity: string;
  unit: string;
  // Value of one unit; a SPONSORED donation's donor pays donation_price instead (null for FREE).
  original_price: string;
  donation_price: string | null;
  expiry_date: string;
  // "HH:MM:SS" or null.
  pickup_from: string | null;
  pickup_until: string | null;
  allergens: string[];
  serving_temperature: "HOT" | "COLD" | "FROZEN" | null;
  status: "Available" | "Expired" | "Removed";
  created_at: string;
  updated_at: string;
  days_until_expiry?: number;
}

// Add/edit donation form state; inputs are raw strings, allergens a list of codes.
export interface DonationFormValues {
  donation_type: DonationType;
  name: string;
  description: string;
  category: string;
  quantity: string;
  unit: string;
  original_price: string;
  donation_price: string;
  expiry_date: string;
  pickup_from: string;
  pickup_until: string;
  allergens: string[];
  serving_temperature: string;
}
