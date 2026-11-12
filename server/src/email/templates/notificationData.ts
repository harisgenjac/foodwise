import { InvalidEmailDataError } from "./types.js";

// One line of an order at the moment of the notification: what was ordered and what the store
// accepted (the same until it decided), the agreed price, the item's status and the store's reason.
export interface OrderLineData {
  product: string;
  unit: string;
  // NUMERIC as text.
  ordered: string;
  quantity: string;
  unitPrice: string;
  status: string;
  reason: string | null;
  note: string | null;
}

// What a notification email needs, snapshotted into email_queue.data when the notification is
// stored (see enqueueNotificationEmails in queue.ts). Every field is null when the notification
// has no such link. The same joins as GET /api/notifications, plus the order's parties and lines.
export interface NotificationEmailData {
  recipientRole: string;
  // Old reservation notifications only (no code writes reservation_id any more).
  reservationId: number | null;
  orderId: number | null;
  productId: number | null;
  donationId: number | null;
  creditRequestId: number | null;
  branchId: number | null;
  announcementId: number | null;
  // The product's, or the donation's for DONATION_REMOVED_BY_ADMIN.
  productName: string | null;
  unit: string | null;
  // The reservation's quantity (NUMERIC as text).
  quantity: string | null;
  // The order's (or reservation's) pickup, local time, YYYY-MM-DDTHH:MI.
  pickupAt: string | null;
  restaurantName: string | null;
  storeName: string | null;
  // The order's code (without #) and lines (the email adds up the totals).
  orderCode: string | null;
  orderLines: OrderLineData[] | null;
  // An admin's reason, or a headquarters' note.
  details: string | null;
  announcementTitleBs: string | null;
  announcementBodyBs: string | null;
  announcementTitleEn: string | null;
  announcementBodyEn: string | null;
  creditRequestType: "SUBSCRIPTION" | "TOPUP" | null;
  credits: number | null;
  creditRequester: string | null;
  creditCompany: string | null;
  branchName: string | null;
}

const STRING_FIELDS = [
  "productName",
  "unit",
  "quantity",
  "pickupAt",
  "restaurantName",
  "storeName",
  "orderCode",
  "details",
  "announcementTitleBs",
  "announcementBodyBs",
  "announcementTitleEn",
  "announcementBodyEn",
  "creditRequestType",
  "creditRequester",
  "creditCompany",
  "branchName",
] as const;
const NUMBER_FIELDS = [
  "reservationId",
  "orderId",
  "productId",
  "donationId",
  "creditRequestId",
  "branchId",
  "announcementId",
  "credits",
] as const;
const LINE_STRING_FIELDS = ["product", "unit", "ordered", "quantity", "unitPrice", "status"] as const;
const LINE_NULLABLE_FIELDS = ["reason", "note"] as const;

const isOrderLine = (value: unknown) => {
  const line = value as Record<string, unknown> | null;
  return (
    typeof line === "object" &&
    line !== null &&
    LINE_STRING_FIELDS.every((field) => typeof line[field] === "string") &&
    LINE_NULLABLE_FIELDS.every((field) => line[field] === null || typeof line[field] === "string")
  );
};

// Data queued before a field existed has no key for it; such a field reads as null.
const NEW_FIELDS = ["orderId", "orderCode", "orderLines"] as const;

export const parseNotificationData = (data: unknown, template: string): NotificationEmailData => {
  const raw = data as Record<string, unknown> | null;
  const value =
    typeof raw === "object" && raw !== null
      ? { ...Object.fromEntries(NEW_FIELDS.map((field) => [field, null])), ...raw }
      : raw;
  const fits =
    typeof value === "object" &&
    value !== null &&
    typeof value.recipientRole === "string" &&
    STRING_FIELDS.every((field) => value[field] === null || typeof value[field] === "string") &&
    NUMBER_FIELDS.every((field) => value[field] === null || typeof value[field] === "number") &&
    (value.orderLines === null || (Array.isArray(value.orderLines) && value.orderLines.every(isOrderLine)));
  if (!fits) throw new InvalidEmailDataError(template);
  return value as unknown as NotificationEmailData;
};

// The jsonb_build_object over the joins in NOTIFICATION_EMAIL_FROM. Keys match NotificationEmailData.
// jsonb_build_object takes at most 100 arguments (50 keys).
export const NOTIFICATION_EMAIL_DATA = `jsonb_build_object(
  'recipientRole', recipients.role::text,
  'reservationId', notifications.reservation_id,
  'orderId', notifications.order_id,
  'productId', notifications.product_id,
  'donationId', notifications.donation_id,
  'creditRequestId', notifications.credit_request_id,
  'branchId', notifications.branch_id,
  'announcementId', notifications.announcement_id,
  'productName', COALESCE(products.name, donation_offers.name),
  'unit', COALESCE(products.unit, donation_offers.unit),
  'quantity', reservations.quantity::text,
  'pickupAt', to_char(orders.pickup_at, 'YYYY-MM-DD"T"HH24:MI'),
  'restaurantName', COALESCE(order_restaurants.business_name, restaurants.business_name),
  'storeName', COALESCE(order_stores.business_name, stores.business_name),
  'orderCode', orders.code::text,
  'orderLines', (
    SELECT json_agg(json_build_object(
      'product', line_products.name,
      'unit', line_products.unit,
      'ordered', line_items.ordered_quantity::text,
      'quantity', line_items.quantity::text,
      'unitPrice', line_items.unit_price::text,
      'status', line_items.status::text,
      'reason', line_items.change_reason::text,
      'note', line_items.change_note
    ) ORDER BY line_items.id)
    FROM reservations AS line_items
    JOIN products AS line_products ON line_products.id = line_items.product_id
    WHERE line_items.order_id = orders.id
  ),
  'details', notifications.details,
  'announcementTitleBs', announcements.title_bs,
  'announcementBodyBs', announcements.body_bs,
  'announcementTitleEn', announcements.title_en,
  'announcementBodyEn', announcements.body_en,
  'creditRequestType', credit_requests.request_type::text,
  'credits', credit_requests.credits,
  'creditRequester', COALESCE(requesters.business_name, requesters.email),
  'creditCompany', requester_companies.name,
  'branchName', branches.business_name
)`;

export const NOTIFICATION_EMAIL_FROM = `notifications
  JOIN users AS recipients ON recipients.id = notifications.user_id
  LEFT JOIN reservations ON reservations.id = notifications.reservation_id
  LEFT JOIN orders ON orders.id = notifications.order_id
  LEFT JOIN users AS order_stores ON order_stores.id = orders.store_id
  LEFT JOIN users AS order_restaurants ON order_restaurants.id = orders.restaurant_id
  LEFT JOIN products ON products.id = notifications.product_id
  LEFT JOIN donation_offers ON donation_offers.id = notifications.donation_id
  LEFT JOIN users AS restaurants ON restaurants.id = reservations.restaurant_id
  LEFT JOIN users AS stores ON stores.id = products.store_id
  LEFT JOIN announcements ON announcements.id = notifications.announcement_id
  LEFT JOIN credit_requests ON credit_requests.id = notifications.credit_request_id
  LEFT JOIN users AS requesters ON requesters.id = credit_requests.user_id
  LEFT JOIN companies AS requester_companies ON requester_companies.id = requesters.company_id
  LEFT JOIN users AS branches ON branches.id = notifications.branch_id`;
