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
  status: "Available" | "Reserved" | "Sold" | "Expired" | "Removed";
  created_at: string;
  updated_at: string;
  available_quantity?: string;
  days_until_expiry?: number;
  business_name?: string;
  city?: string;
}

export interface Reservation {
  id: number;
  product_id: number;
  restaurant_id: number;
  quantity: string;
  status: "Pending" | "Confirmed" | "Completed" | "Cancelled";
  pickup_date: string;
  created_at: string;
  updated_at: string;
  product_name?: string;
  description?: string;
  discounted_price?: string;
  original_price?: string;
  category?: string;
  business_name?: string;
  city?: string;
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
}

export interface Favorites {
  id: number;
  restaurant_id: number;
  store_id: number;
  created_at: string;
}
