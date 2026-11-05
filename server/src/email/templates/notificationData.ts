import { InvalidEmailDataError } from "./types.js";

// What a notification email needs, snapshotted into email_queue.data when the notification is
// stored (see enqueueNotificationEmails in queue.ts). Every field is null when the notification
// has no such link. The same joins as GET /api/notifications, plus the reservation's parties.
export interface NotificationEmailData {
  recipientRole: string;
  reservationId: number | null;
  productId: number | null;
  donationId: number | null;
  creditRequestId: number | null;
  branchId: number | null;
  announcementId: number | null;
  // The product's, or the donation's for DONATION_REMOVED_BY_ADMIN.
  productName: string | null;
  unit: string | null;
  // The reservation's quantity (NUMERIC as text) and pickup (local time, YYYY-MM-DDTHH:MI).
  quantity: string | null;
  pickupAt: string | null;
  restaurantName: string | null;
  storeName: string | null;
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
  "productId",
  "donationId",
  "creditRequestId",
  "branchId",
  "announcementId",
  "credits",
] as const;

export const parseNotificationData = (data: unknown, template: string): NotificationEmailData => {
  const value = data as Record<string, unknown> | null;
  const fits =
    typeof value === "object" &&
    value !== null &&
    typeof value.recipientRole === "string" &&
    STRING_FIELDS.every((field) => value[field] === null || typeof value[field] === "string") &&
    NUMBER_FIELDS.every((field) => value[field] === null || typeof value[field] === "number");
  if (!fits) throw new InvalidEmailDataError(template);
  return value as unknown as NotificationEmailData;
};

// The jsonb_build_object over the joins in NOTIFICATION_EMAIL_FROM. Keys match NotificationEmailData.
export const NOTIFICATION_EMAIL_DATA = `jsonb_build_object(
  'recipientRole', recipients.role::text,
  'reservationId', notifications.reservation_id,
  'productId', notifications.product_id,
  'donationId', notifications.donation_id,
  'creditRequestId', notifications.credit_request_id,
  'branchId', notifications.branch_id,
  'announcementId', notifications.announcement_id,
  'productName', COALESCE(products.name, donation_offers.name),
  'unit', COALESCE(products.unit, donation_offers.unit),
  'quantity', reservations.quantity::text,
  'pickupAt', to_char(reservations.pickup_date, 'YYYY-MM-DD"T"HH24:MI'),
  'restaurantName', restaurants.business_name,
  'storeName', stores.business_name,
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
  LEFT JOIN products ON products.id = notifications.product_id
  LEFT JOIN donation_offers ON donation_offers.id = notifications.donation_id
  LEFT JOIN users AS restaurants ON restaurants.id = reservations.restaurant_id
  LEFT JOIN users AS stores ON stores.id = products.store_id
  LEFT JOIN announcements ON announcements.id = notifications.announcement_id
  LEFT JOIN credit_requests ON credit_requests.id = notifications.credit_request_id
  LEFT JOIN users AS requesters ON requesters.id = credit_requests.user_id
  LEFT JOIN companies AS requester_companies ON requester_companies.id = requesters.company_id
  LEFT JOIN users AS branches ON branches.id = notifications.branch_id`;
