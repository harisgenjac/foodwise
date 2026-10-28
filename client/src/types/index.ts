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
  // For a restaurant: straight-line km from its city to the store's (null without a city on either side).
  distance_km?: number | null;
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
  // On GET /reservations/:id and /reservations/mine.
  store_id?: number;
  // Only on GET /reservations/:id, which returns both parties.
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

// COMPANY = a store chain's headquarters login (see Company).
export type Role = "STORE" | "RESTAURANT" | "ADMIN" | "COMPANY";

export interface User {
  id: number;
  // Null until the user fills in the profile (an admin creates accounts with only an email).
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: Role;
  business_name?: string;
  logo_url?: string;
  address?: string;
  // The city's name (for display) and its id in the city list (for forms and filters).
  city?: string;
  city_id?: number | null;
  // On GET /users/stores: km from the restaurant's city.
  distance_km?: number | null;
  opening_hours?: string;
  pickup_hours?: string;
  description?: string;
  phone?: string;
  created_at?: string;
  // Only on GET /users/stores (COUNT, so a string).
  active_products?: string;
  // Set while the user still has a temporary password from an admin.
  must_change_password?: boolean;
  // The user's company: set for a COMPANY (headquarters) user, null otherwise for now.
  company_id?: number | null;
  company_name?: string | null;
  // Only on GET /users/me: the company's logo, shown as a COMPANY user's avatar.
  company_logo_url?: string | null;
  // Only on the admin endpoints.
  is_blocked?: boolean;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  // Only on the admin endpoints: the user's company is blocked (the user cannot sign in).
  company_is_blocked?: boolean;
}

// A store chain (GET /company/me for its headquarters, the admin's company endpoints).
export interface Company {
  id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  branch_count: number;
  // Only on the admin endpoints.
  is_blocked?: boolean;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  created_at?: string;
}

// A row of GET /admin/companies.
export interface AdminCompanyListItem {
  id: number;
  name: string;
  hq_email: string | null;
  branch_count: number;
  is_blocked: boolean;
  created_at: string;
}

// GET /admin/companies/:id. Branches come with the next step, so the list is empty for now.
export interface AdminCompanyDetails {
  company: Company;
  hqUsers: Pick<User, "id" | "email" | "first_name" | "last_name" | "phone" | "is_blocked" | "must_change_password" | "created_at">[];
  branches: { id: number; email: string; business_name: string | null; city: string | null; is_blocked: boolean; created_at: string }[];
  actions: Pick<AdminAction, "id" | "action" | "reason" | "created_at" | "admin_email">[];
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

// Dashboard stat cards (GET /dashboard/stats), all numbers. `successful_reservations` = accepted
// (Confirmed + Completed); `saved` and `savings` = picked up (Completed) only.
export interface StoreDashboardStats {
  active_products: number;
  pending_reservations: number;
  successful_reservations: number;
  saved: { kg: number; l: number; pieces: number };
}

export interface RestaurantDashboardStats {
  pending_reservations: number;
  successful_reservations: number;
  savings: number;
}

// Admin panel (GET /admin/*). Counts arrive as numbers.
export interface AdminStats {
  users: { stores: number; restaurants: number; admins: number; blocked: number; incomplete_profiles: number };
  products: { active: number; sold: number; expired: number; removed: number };
  reservations: Record<Reservation["status"], number>;
  saved: { kg: number; l: number; pieces: number; value: number; savings: number };
  donations: { available: number; expired: number; removed: number };
  // Subscriptions and credits of the current credit month.
  credits: {
    period_start: string;
    active_subscriptions: number;
    by_plan: { plan: string; count: number }[];
    auto_renew: number;
    next_month_subscriptions: number;
    without_subscription: number;
    pending_requests: number;
    credits_used: number;
  };
}

export type AdminActionType =
  | "CREATE_USER"
  | "RESET_PASSWORD"
  | "BLOCK_USER"
  | "UNBLOCK_USER"
  | "REMOVE_PRODUCT"
  | "REMOVE_DONATION"
  | "CANCEL_RESERVATION"
  | "UPDATE_PROFILE"
  | "CREATE_ANNOUNCEMENT"
  | "END_ANNOUNCEMENT"
  | "APPROVE_CREDIT_REQUEST"
  | "REJECT_CREDIT_REQUEST"
  | "ADJUST_CREDITS"
  | "CREATE_COMPANY"
  | "UPDATE_COMPANY"
  | "BLOCK_COMPANY"
  | "UNBLOCK_COMPANY";

export interface AdminAction {
  id: number;
  action: AdminActionType;
  reason: string | null;
  created_at: string;
  admin_id?: number;
  admin_email: string;
  target_user_id?: number | null;
  target_email?: string | null;
  target_business_name?: string | null;
  target_product_id: number | null;
  product_name: string | null;
  target_donation_id: number | null;
  donation_name: string | null;
  target_reservation_id?: number | null;
  target_announcement_id?: number | null;
  announcement_title?: string | null;
  target_company_id?: number | null;
  company_name?: string | null;
}

export type AnnouncementAudience = "ALL" | "STORE" | "RESTAURANT";

// GET /announcements/active; the English texts are optional and fall back to Bosnian.
export interface Announcement {
  id: number;
  title_bs: string;
  body_bs: string;
  title_en: string | null;
  body_en: string | null;
  created_at: string;
}

export interface AdminAnnouncement extends Announcement {
  audience: AnnouncementAudience;
  expires_at: string | null;
  ended_at: string | null;
  admin_email: string;
  is_active: boolean;
  recipients: number;
  dismissed: number;
}

export interface AdminUserCounts {
  products: number;
  active_products: number;
  reservations: number;
  pending_reservations: number;
  completed_reservations: number;
  donations: number;
}

export interface AdminProduct {
  id: number;
  store_id: number;
  name: string;
  category: string;
  quantity: string;
  unit: string;
  original_price: string;
  discounted_price: string;
  expiry_date: string;
  status: Product["status"];
  created_at: string;
  business_name: string | null;
  store_email: string;
  store_is_blocked: boolean;
}

export interface AdminDonation {
  id: number;
  donor_id: number;
  donation_type: DonationType;
  name: string;
  category: string;
  quantity: string;
  unit: string;
  original_price: string;
  donation_price: string | null;
  expiry_date: string;
  status: DonationOffer["status"];
  created_at: string;
  business_name: string | null;
  donor_email: string;
  donor_role: Role;
}

export interface AdminReservation {
  id: number;
  status: Reservation["status"];
  quantity: string;
  unit_price: string;
  pickup_date: string;
  picked_up_at: string | null;
  created_at: string;
  is_overdue: boolean;
  product_id: number;
  product_name: string;
  unit: string;
  store_id: number;
  store_name: string | null;
  store_email: string;
  restaurant_id: number;
  restaurant_name: string | null;
  restaurant_email: string;
}

// Credits (GET /credits/*). Months are YYYY-MM-01; prices are DECIMAL strings.
export interface Plan {
  id: number;
  name: string;
  credits_per_period: number;
  price: string;
}

export interface TopupPackage {
  id: number;
  credits: number;
  price: string;
}

export interface CreditSubscription {
  id: number;
  plan_id: number;
  plan_name: string;
  credits_per_period: number;
  period_month: string;
  auto_renew: boolean;
}

export type CreditRequestType = "SUBSCRIPTION" | "TOPUP";
export type CreditRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";

// A request as its user sees it (never with the admin's note).
export interface CreditRequest {
  id: number;
  user_id: number;
  request_type: CreditRequestType;
  plan_id: number | null;
  topup_package_id: number | null;
  period_month: string;
  auto_renew: boolean;
  status: CreditRequestStatus;
  source: "USER" | "AUTO_RENEW";
  created_at: string;
  reviewed_at: string | null;
  plan_name: string | null;
  credits: number;
  price: string;
}

export interface CreditSummary {
  periodStart: string;
  periodEnd: string;
  subscription: CreditSubscription | null;
  hasActiveSubscription: boolean;
  total: number;
  used: number;
  available: number;
  nextSubscription: CreditSubscription | null;
  pendingRequests: CreditRequest[];
}

export interface CreditHistory {
  year: number;
  months: { month: string; hasSubscription: boolean; total: number; used: number }[];
  categories: { category: string | null; used: number }[];
}

export interface AdminCreditUser {
  id: number;
  email: string;
  role: Role;
  business_name: string | null;
  is_blocked: boolean;
  pending_requests: number;
  plan_name: string | null;
  has_subscription: boolean;
  total: number;
  used: number;
  available: number;
}

export interface AdminCreditRequest extends CreditRequest {
  admin_note: string | null;
  user_email: string;
  user_business_name: string | null;
  user_role: Role;
  reviewed_by_email: string | null;
}

export interface CreditTransaction {
  id: number;
  period_month: string;
  amount: number;
  type:
    | "PLAN_GRANT"
    | "TOPUP_GRANT"
    | "ADMIN_ADJUSTMENT"
    | "PRODUCT_CHARGE"
    | "PRODUCT_REFUND"
    | "RESERVATION_CHARGE"
    | "RESERVATION_REFUND";
  reason: string | null;
  category: string | null;
  related_entity_type: "product" | "reservation" | "credit_request" | null;
  related_entity_id: number | null;
  refunds_transaction_id: number | null;
  actor: "USER" | "ADMIN" | "SYSTEM";
  created_at: string;
  created_by_email: string | null;
}

// One entry of the fixed city list (GET /cities).
export interface City {
  id: number;
  name: string;
}
