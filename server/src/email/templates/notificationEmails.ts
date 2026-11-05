import type { NotificationType } from "../../utils/notifications.js";
import { formatPickup, formatQuantity, unitLabel } from "./format.js";
import { renderLayout, type EmailLanguage } from "./layout.js";
import { parseNotificationData, type NotificationEmailData } from "./notificationData.js";
import type { EmailTemplate } from "./types.js";

// One email per in-app notification type, worded like the notification itself (the client's
// notifications.types / notifications.credits texts), with the details the notification links to
// and a button to the same page the notification opens (getNotificationLink on the client).

interface Copy {
  subject: string;
  heading: string;
  intro: string[];
  outro?: string[];
}

// The values a text can use, already formatted for the language.
interface Values {
  product: string;
  // "2,5 kg"
  amount: string;
  branch: string;
  credits: string;
  // "Bingo d.o.o. → Bingo Tuzla" for a branch's request.
  requester: string;
  topup: boolean;
}

type CopyFn = (v: Values, d: NotificationEmailData) => Copy;

// A credit type's text depends on whether the request is a subscription or a top-up.
const byRequest = (subscription: CopyFn, topup: CopyFn): CopyFn => (v, d) => (v.topup ? topup : subscription)(v, d);

// Splits an announcement body into paragraphs (blank lines, or single line breaks).
const paragraphs = (body: string | null) =>
  (body ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const announcement = (d: NotificationEmailData, lang: EmailLanguage) => {
  const english = lang === "en" && d.announcementTitleEn;
  return {
    title: (english ? d.announcementTitleEn : d.announcementTitleBs) ?? "",
    body: english && d.announcementBodyEn ? d.announcementBodyEn : d.announcementBodyBs,
  };
};

const REFUNDED = { bs: "Kredit za rezervaciju vam je vraćen.", en: "The reservation's credit was returned to you." };

const COPY: Record<EmailLanguage, Record<NotificationType, CopyFn>> = {
  bs: {
    RESERVATION_CREATED: (v) => ({
      subject: `Nova rezervacija: ${v.amount} ${v.product}`,
      heading: "Nova rezervacija",
      intro: ["Imate novi zahtjev za rezervaciju."],
      outro: ["Prihvatite ili odbijte rezervaciju u aplikaciji."],
    }),
    RESERVATION_ACCEPTED: (v) => ({
      subject: `Rezervacija prihvaćena: ${v.product}`,
      heading: "Rezervacija je prihvaćena",
      intro: [`Vaša rezervacija za ${v.product} je prihvaćena.`],
      outro: ["Preuzmite hranu u dogovoreno vrijeme."],
    }),
    RESERVATION_REJECTED: (v) => ({
      subject: `Rezervacija odbijena: ${v.product}`,
      heading: "Rezervacija je odbijena",
      intro: [`Vaša rezervacija za ${v.product} je odbijena.`],
      outro: [REFUNDED.bs],
    }),
    RESERVATION_CANCELLED: (v) => ({
      subject: `Rezervacija otkazana: ${v.product}`,
      heading: "Restoran je otkazao rezervaciju",
      intro: [`Restoran je otkazao rezervaciju za ${v.product}.`],
      outro: ["Količina je ponovo u ponudi."],
    }),
    RESERVATION_EXPIRED: (v) => ({
      subject: `Rezervacija otkazana: ${v.product}`,
      heading: "Rezervacija je otkazana",
      intro: [`Rezervacija za ${v.product} je otkazana jer je proizvodu istekao rok trajanja.`],
      outro: [REFUNDED.bs],
    }),
    PRODUCT_EXPIRED: (v) => ({
      subject: `Istekao rok trajanja: ${v.product}`,
      heading: "Proizvodu je istekao rok trajanja",
      intro: [`Proizvodu ${v.product} je istekao rok trajanja i uklonjen je iz ponude.`],
    }),
    PRODUCT_SOLD_OUT: (v) => ({
      subject: `Rasprodano: ${v.product}`,
      heading: "Proizvod je rasprodan",
      intro: [`Proizvod ${v.product} je rasprodan.`],
    }),
    PRODUCT_EXPIRING_SOON: (v) => ({
      subject: `Podsjetnik: ${v.product} ističe sutra`,
      heading: "Proizvod ističe sutra",
      intro: [`${v.product} ističe sutra, a ima zahtjeva na čekanju.`],
      outro: ["Prihvatite ili odbijte zahtjeve prije isteka roka."],
    }),
    PICKUP_TODAY: (v) => ({
      subject: `Podsjetnik: danas preuzimate ${v.product}`,
      heading: "Danas je preuzimanje",
      intro: [`Danas preuzimate ${v.product}.`],
    }),
    RESERVATION_COMPLETED: (v) => ({
      subject: `Preuzimanje potvrđeno: ${v.product}`,
      heading: "Preuzimanje je potvrđeno",
      intro: [`Prodavnica je potvrdila da ste preuzeli ${v.amount} ${v.product}.`],
    }),
    PICKUP_MISSED: (v) => ({
      subject: `Rezervacija otkazana: ${v.product}`,
      heading: "Preuzimanje je propušteno",
      intro: [`Rezervacija za ${v.product} je otkazana jer nije preuzeta na vrijeme.`],
    }),
    PRODUCT_REMOVED_BY_ADMIN: (v) => ({
      subject: `Proizvod uklonjen: ${v.product}`,
      heading: "Administrator je uklonio proizvod",
      intro: [`Administrator je uklonio proizvod ${v.product} iz ponude.`],
    }),
    DONATION_REMOVED_BY_ADMIN: (v) => ({
      subject: `Donacija uklonjena: ${v.product}`,
      heading: "Administrator je uklonio donaciju",
      intro: [`Administrator je uklonio donaciju ${v.product}.`],
    }),
    RESERVATION_CANCELLED_BY_ADMIN: (v) => ({
      subject: `Rezervacija otkazana: ${v.product}`,
      heading: "Administrator je otkazao rezervaciju",
      intro: [`Rezervaciju za ${v.product} je otkazao administrator platforme.`],
    }),
    RESERVATION_CANCELLED_STORE_CLOSED: (v) => ({
      subject: `Rezervacija otkazana: ${v.product}`,
      heading: "Prodavnica više nije aktivna",
      intro: [`Rezervacija za ${v.product} je otkazana jer prodavnica više nije aktivna.`],
      outro: [REFUNDED.bs],
    }),
    BRANCH_BLOCKED: (v) => ({
      subject: `Poslovnica blokirana: ${v.branch}`,
      heading: "Poslovnica je blokirana",
      intro: [`Administrator je blokirao poslovnicu ${v.branch}.`],
    }),
    BRANCH_UNBLOCKED: (v) => ({
      subject: `Poslovnica odblokirana: ${v.branch}`,
      heading: "Poslovnica je odblokirana",
      intro: [`Administrator je odblokirao poslovnicu ${v.branch}.`],
    }),
    BRANCH_DEACTIVATED: (v) => ({
      subject: `Poslovnica deaktivirana: ${v.branch}`,
      heading: "Poslovnica je deaktivirana",
      intro: [`Administrator je deaktivirao poslovnicu ${v.branch}.`],
    }),
    BRANCH_REACTIVATED: (v) => ({
      subject: `Poslovnica ponovo aktivna: ${v.branch}`,
      heading: "Poslovnica je ponovo aktivna",
      intro: [`Administrator je ponovo aktivirao poslovnicu ${v.branch}.`],
    }),
    // Replaced by the announcement's own title and text (see renderNotificationEmail).
    PLATFORM_ANNOUNCEMENT: () => ({ subject: "", heading: "", intro: [] }),
    CREDIT_REQUEST_CREATED: byRequest(
      (v) => ({
        subject: `Novi zahtjev za pretplatu: ${v.requester}`,
        heading: "Zahtjev za kredite čeka odobrenje",
        intro: [`Novi zahtjev za pretplatu: ${v.requester}, ${v.credits} kredita.`],
      }),
      (v) => ({
        subject: `Novi zahtjev za dodatne kredite: ${v.requester}`,
        heading: "Zahtjev za kredite čeka odobrenje",
        intro: [`Novi zahtjev za dodatne kredite: ${v.requester}, ${v.credits} kredita.`],
      }),
    ),
    CREDIT_REQUEST_APPROVED: byRequest(
      (v) => ({
        subject: "Pretplata je odobrena",
        heading: "Pretplata je odobrena",
        intro: [`Vaša pretplata (${v.credits} kredita) je odobrena.`],
      }),
      (v) => ({
        subject: "Dodatni krediti su odobreni",
        heading: "Dodatni krediti su odobreni",
        intro: [`Dodatni krediti (${v.credits}) su odobreni i dodani ovom mjesecu.`],
      }),
    ),
    CREDIT_REQUEST_REJECTED: byRequest(
      () => ({
        subject: "Zahtjev za pretplatu je odbijen",
        heading: "Zahtjev za pretplatu je odbijen",
        intro: ["Vaš zahtjev za pretplatu je odbijen."],
      }),
      () => ({
        subject: "Zahtjev za dodatne kredite je odbijen",
        heading: "Zahtjev za dodatne kredite je odbijen",
        intro: ["Vaš zahtjev za dodatne kredite je odbijen."],
      }),
    ),
    CREDIT_RENEWAL_CREATED: (v) => ({
      subject: "Obnova pretplate je poslana na odobrenje",
      heading: "Obnova pretplate je poslana na odobrenje",
      intro: [`Zahtjev za obnovu pretplate (${v.credits} kredita) je poslan na odobrenje.`],
    }),
    CREDIT_REQUEST_EXPIRED: byRequest(
      () => ({
        subject: "Zahtjev za pretplatu je istekao",
        heading: "Zahtjev za pretplatu je istekao",
        intro: ["Vaš zahtjev za pretplatu je istekao prije nego što je odobren."],
      }),
      () => ({
        subject: "Zahtjev za dodatne kredite je istekao",
        heading: "Zahtjev za dodatne kredite je istekao",
        intro: ["Vaš zahtjev za dodatne kredite je istekao prije nego što je odobren."],
      }),
    ),
    CREDIT_RENEWAL_SKIPPED: () => ({
      subject: "Pretplata se neće automatski obnoviti",
      heading: "Pretplata se neće automatski obnoviti",
      intro: ["Pretplata se ne može automatski obnoviti jer se njen plan više ne nudi."],
      outro: ["Izaberite plan za idući mjesec."],
    }),
    BRANCH_TOPUP_REQUESTED: (v) => ({
      subject: `Poslovnica ${v.branch} traži dodatne kredite`,
      heading: "Poslovnica traži dodatne kredite",
      intro: [`Poslovnica ${v.branch} traži ${v.credits} dodatnih kredita.`],
    }),
    BRANCH_CREDIT_REQUEST_APPROVED: byRequest(
      (v) => ({
        subject: `Pretplata odobrena: ${v.branch}`,
        heading: "Pretplata poslovnice je odobrena",
        intro: [`Pretplata za poslovnicu ${v.branch} (${v.credits} kredita) je odobrena.`],
      }),
      (v) => ({
        subject: `Dodatni krediti odobreni: ${v.branch}`,
        heading: "Dodatni krediti poslovnice su odobreni",
        intro: [`Dodatni krediti za poslovnicu ${v.branch} (${v.credits}) su odobreni.`],
      }),
    ),
    BRANCH_CREDIT_REQUEST_REJECTED: byRequest(
      (v) => ({
        subject: `Zahtjev za pretplatu odbijen: ${v.branch}`,
        heading: "Zahtjev poslovnice je odbijen",
        intro: [`Zahtjev za pretplatu poslovnice ${v.branch} je odbijen.`],
      }),
      (v) => ({
        subject: `Zahtjev za dodatne kredite odbijen: ${v.branch}`,
        heading: "Zahtjev poslovnice je odbijen",
        intro: [`Zahtjev za dodatne kredite poslovnice ${v.branch} je odbijen.`],
      }),
    ),
    BRANCH_CREDIT_REQUEST_EXPIRED: byRequest(
      (v) => ({
        subject: `Zahtjev za pretplatu istekao: ${v.branch}`,
        heading: "Zahtjev poslovnice je istekao",
        intro: [`Zahtjev za pretplatu poslovnice ${v.branch} je istekao prije odobrenja.`],
      }),
      (v) => ({
        subject: `Zahtjev za dodatne kredite istekao: ${v.branch}`,
        heading: "Zahtjev poslovnice je istekao",
        intro: [`Zahtjev za dodatne kredite poslovnice ${v.branch} je istekao prije odobrenja.`],
      }),
    ),
    CREDIT_TOPUP_COMPANY_APPROVED: (v) => ({
      subject: "Centrala je proslijedila vaš zahtjev",
      heading: "Centrala je proslijedila vaš zahtjev",
      intro: [`Centrala je proslijedila vaš zahtjev za ${v.credits} dodatnih kredita administratoru na odobrenje.`],
    }),
    CREDIT_TOPUP_COMPANY_REJECTED: (v) => ({
      subject: "Centrala je odbila vaš zahtjev",
      heading: "Centrala je odbila vaš zahtjev",
      intro: [`Centrala je odbila vaš zahtjev za ${v.credits} dodatnih kredita.`],
    }),
  },
  en: {
    RESERVATION_CREATED: (v) => ({
      subject: `New reservation: ${v.amount} ${v.product}`,
      heading: "New reservation",
      intro: ["You have a new reservation request."],
      outro: ["Accept or reject the reservation in the app."],
    }),
    RESERVATION_ACCEPTED: (v) => ({
      subject: `Reservation accepted: ${v.product}`,
      heading: "Your reservation was accepted",
      intro: [`Your reservation for ${v.product} was accepted.`],
      outro: ["Pick up the food at the agreed time."],
    }),
    RESERVATION_REJECTED: (v) => ({
      subject: `Reservation rejected: ${v.product}`,
      heading: "Your reservation was rejected",
      intro: [`Your reservation for ${v.product} was rejected.`],
      outro: [REFUNDED.en],
    }),
    RESERVATION_CANCELLED: (v) => ({
      subject: `Reservation cancelled: ${v.product}`,
      heading: "A restaurant cancelled its reservation",
      intro: [`A restaurant cancelled its reservation for ${v.product}.`],
      outro: ["The quantity is on offer again."],
    }),
    RESERVATION_EXPIRED: (v) => ({
      subject: `Reservation cancelled: ${v.product}`,
      heading: "Your reservation was cancelled",
      intro: [`Your reservation for ${v.product} was cancelled because the product expired.`],
      outro: [REFUNDED.en],
    }),
    PRODUCT_EXPIRED: (v) => ({
      subject: `Expired: ${v.product}`,
      heading: "A product has expired",
      intro: [`${v.product} has expired and was removed from the marketplace.`],
    }),
    PRODUCT_SOLD_OUT: (v) => ({
      subject: `Sold out: ${v.product}`,
      heading: "A product is sold out",
      intro: [`${v.product} is sold out.`],
    }),
    PRODUCT_EXPIRING_SOON: (v) => ({
      subject: `Reminder: ${v.product} expires tomorrow`,
      heading: "A product expires tomorrow",
      intro: [`${v.product} expires tomorrow and has pending requests.`],
      outro: ["Accept or reject the requests before it expires."],
    }),
    PICKUP_TODAY: (v) => ({
      subject: `Reminder: pick up ${v.product} today`,
      heading: "Pickup today",
      intro: [`Pick up ${v.product} today.`],
    }),
    RESERVATION_COMPLETED: (v) => ({
      subject: `Pickup confirmed: ${v.product}`,
      heading: "Pickup confirmed",
      intro: [`The store confirmed that you picked up ${v.amount} ${v.product}.`],
    }),
    PICKUP_MISSED: (v) => ({
      subject: `Reservation cancelled: ${v.product}`,
      heading: "Pickup missed",
      intro: [`Your reservation for ${v.product} was cancelled because it was not picked up in time.`],
    }),
    PRODUCT_REMOVED_BY_ADMIN: (v) => ({
      subject: `Product removed: ${v.product}`,
      heading: "An administrator removed a product",
      intro: [`An administrator removed ${v.product} from your offer.`],
    }),
    DONATION_REMOVED_BY_ADMIN: (v) => ({
      subject: `Donation removed: ${v.product}`,
      heading: "An administrator removed a donation",
      intro: [`An administrator removed your donation ${v.product}.`],
    }),
    RESERVATION_CANCELLED_BY_ADMIN: (v) => ({
      subject: `Reservation cancelled: ${v.product}`,
      heading: "An administrator cancelled a reservation",
      intro: [`The platform administrator cancelled the reservation for ${v.product}.`],
    }),
    RESERVATION_CANCELLED_STORE_CLOSED: (v) => ({
      subject: `Reservation cancelled: ${v.product}`,
      heading: "The store is no longer active",
      intro: [`The reservation for ${v.product} was cancelled because the store is no longer active.`],
      outro: [REFUNDED.en],
    }),
    BRANCH_BLOCKED: (v) => ({
      subject: `Branch blocked: ${v.branch}`,
      heading: "A branch was blocked",
      intro: [`The platform administrator blocked the branch ${v.branch}.`],
    }),
    BRANCH_UNBLOCKED: (v) => ({
      subject: `Branch unblocked: ${v.branch}`,
      heading: "A branch was unblocked",
      intro: [`The platform administrator unblocked the branch ${v.branch}.`],
    }),
    BRANCH_DEACTIVATED: (v) => ({
      subject: `Branch deactivated: ${v.branch}`,
      heading: "A branch was deactivated",
      intro: [`The platform administrator deactivated the branch ${v.branch}.`],
    }),
    BRANCH_REACTIVATED: (v) => ({
      subject: `Branch reactivated: ${v.branch}`,
      heading: "A branch was reactivated",
      intro: [`The platform administrator reactivated the branch ${v.branch}.`],
    }),
    PLATFORM_ANNOUNCEMENT: () => ({ subject: "", heading: "", intro: [] }),
    CREDIT_REQUEST_CREATED: byRequest(
      (v) => ({
        subject: `New subscription request: ${v.requester}`,
        heading: "A credit request is waiting for approval",
        intro: [`New subscription request: ${v.requester}, ${v.credits} credits.`],
      }),
      (v) => ({
        subject: `New request for extra credits: ${v.requester}`,
        heading: "A credit request is waiting for approval",
        intro: [`New request for extra credits: ${v.requester}, ${v.credits} credits.`],
      }),
    ),
    CREDIT_REQUEST_APPROVED: byRequest(
      (v) => ({
        subject: "Your subscription was approved",
        heading: "Your subscription was approved",
        intro: [`Your subscription (${v.credits} credits) was approved.`],
      }),
      (v) => ({
        subject: "Your extra credits were approved",
        heading: "Your extra credits were approved",
        intro: [`Your extra credits (${v.credits}) were approved and added to this month.`],
      }),
    ),
    CREDIT_REQUEST_REJECTED: byRequest(
      () => ({
        subject: "Your subscription request was rejected",
        heading: "Your subscription request was rejected",
        intro: ["Your subscription request was rejected."],
      }),
      () => ({
        subject: "Your request for extra credits was rejected",
        heading: "Your request for extra credits was rejected",
        intro: ["Your request for extra credits was rejected."],
      }),
    ),
    CREDIT_RENEWAL_CREATED: (v) => ({
      subject: "Your subscription renewal was sent for approval",
      heading: "Your subscription renewal was sent for approval",
      intro: [`Your subscription renewal request (${v.credits} credits) was sent for approval.`],
    }),
    CREDIT_REQUEST_EXPIRED: byRequest(
      () => ({
        subject: "Your subscription request expired",
        heading: "Your subscription request expired",
        intro: ["Your subscription request expired before it was approved."],
      }),
      () => ({
        subject: "Your request for extra credits expired",
        heading: "Your request for extra credits expired",
        intro: ["Your request for extra credits expired before it was approved."],
      }),
    ),
    CREDIT_RENEWAL_SKIPPED: () => ({
      subject: "Your subscription will not renew automatically",
      heading: "Your subscription will not renew automatically",
      intro: ["Your subscription cannot renew automatically because its plan is no longer offered."],
      outro: ["Choose a plan for next month."],
    }),
    BRANCH_TOPUP_REQUESTED: (v) => ({
      subject: `Branch ${v.branch} asks for extra credits`,
      heading: "A branch asks for extra credits",
      intro: [`Branch ${v.branch} asks for ${v.credits} extra credits.`],
    }),
    BRANCH_CREDIT_REQUEST_APPROVED: byRequest(
      (v) => ({
        subject: `Plan approved: ${v.branch}`,
        heading: "A branch's plan was approved",
        intro: [`The plan for branch ${v.branch} (${v.credits} credits) was approved.`],
      }),
      (v) => ({
        subject: `Extra credits approved: ${v.branch}`,
        heading: "A branch's extra credits were approved",
        intro: [`Extra credits for branch ${v.branch} (${v.credits}) were approved.`],
      }),
    ),
    BRANCH_CREDIT_REQUEST_REJECTED: byRequest(
      (v) => ({
        subject: `Plan request rejected: ${v.branch}`,
        heading: "A branch's request was rejected",
        intro: [`The plan request for branch ${v.branch} was rejected.`],
      }),
      (v) => ({
        subject: `Extra credits request rejected: ${v.branch}`,
        heading: "A branch's request was rejected",
        intro: [`The extra credits request for branch ${v.branch} was rejected.`],
      }),
    ),
    BRANCH_CREDIT_REQUEST_EXPIRED: byRequest(
      (v) => ({
        subject: `Plan request expired: ${v.branch}`,
        heading: "A branch's request expired",
        intro: [`The plan request for branch ${v.branch} expired before it was approved.`],
      }),
      (v) => ({
        subject: `Extra credits request expired: ${v.branch}`,
        heading: "A branch's request expired",
        intro: [`The extra credits request for branch ${v.branch} expired before it was approved.`],
      }),
    ),
    CREDIT_TOPUP_COMPANY_APPROVED: (v) => ({
      subject: "Your headquarters forwarded your request",
      heading: "Your headquarters forwarded your request",
      intro: [`Your headquarters sent your request for ${v.credits} extra credits to an administrator for approval.`],
    }),
    CREDIT_TOPUP_COMPANY_REJECTED: (v) => ({
      subject: "Your headquarters rejected your request",
      heading: "Your headquarters rejected your request",
      intro: [`Your headquarters rejected your request for ${v.credits} extra credits.`],
    }),
  },
};

// Where the button goes, like getNotificationLink on the client (the same order of checks).
type LinkKind = "reservation" | "product" | "donations" | "dashboard" | "credits" | "requests" | "branch" | "list";

export const notificationLink = (type: NotificationType, d: NotificationEmailData): { path: string; kind: LinkKind } => {
  if (type === "BRANCH_TOPUP_REQUESTED") return { path: "/company/credits", kind: "credits" };
  if (d.recipientRole === "COMPANY" && d.branchId !== null) {
    return { path: `/company/branches/${d.branchId}`, kind: "branch" };
  }
  if (d.reservationId !== null) return { path: `/reservation/${d.reservationId}`, kind: "reservation" };
  if (d.productId !== null) return { path: `/products/${d.productId}`, kind: "product" };
  if (d.donationId !== null) return { path: "/donate-food", kind: "donations" };
  if (d.announcementId !== null) return { path: "/dashboard", kind: "dashboard" };
  if (type === "CREDIT_REQUEST_CREATED") return { path: "/admin/credit-requests", kind: "requests" };
  if (type === "CREDIT_REQUEST_APPROVED" || type === "CREDIT_REQUEST_REJECTED") {
    return { path: "/credits", kind: "credits" };
  }
  if (
    type === "CREDIT_TOPUP_COMPANY_APPROVED" ||
    type === "CREDIT_TOPUP_COMPANY_REJECTED" ||
    (type === "CREDIT_REQUEST_EXPIRED" && d.creditRequestType === "TOPUP")
  ) {
    return { path: "/my-profile#topup", kind: "credits" };
  }
  if (type === "CREDIT_RENEWAL_CREATED" || type === "CREDIT_REQUEST_EXPIRED" || type === "CREDIT_RENEWAL_SKIPPED") {
    return { path: "/my-profile#subscription", kind: "credits" };
  }
  if (d.recipientRole === "COMPANY") return { path: "/dashboard", kind: "dashboard" };
  return { path: d.recipientRole === "STORE" ? "/reservations" : "/my-reservations", kind: "list" };
};

const BUTTONS: Record<EmailLanguage, Record<LinkKind, string>> = {
  bs: {
    reservation: "Otvori rezervaciju",
    product: "Otvori proizvod",
    donations: "Otvori donacije",
    dashboard: "Otvori FoodWise",
    credits: "Otvori kredite",
    requests: "Otvori zahtjeve",
    branch: "Otvori poslovnicu",
    list: "Otvori rezervacije",
  },
  en: {
    reservation: "Open reservation",
    product: "Open product",
    donations: "Open donations",
    dashboard: "Open FoodWise",
    credits: "Open credits",
    requests: "Open requests",
    branch: "Open branch",
    list: "Open reservations",
  },
};

const LABELS: Record<EmailLanguage, Record<string, string>> = {
  bs: {
    product: "Proizvod",
    donation: "Donacija",
    quantity: "Količina",
    restaurant: "Restoran",
    store: "Prodavnica",
    pickup: "Preuzimanje",
    branch: "Poslovnica",
    requester: "Podnosilac",
    credits: "Krediti",
    reason: "Razlog",
    note: "Napomena centrale",
  },
  en: {
    product: "Product",
    donation: "Donation",
    quantity: "Quantity",
    restaurant: "Restaurant",
    store: "Store",
    pickup: "Pickup",
    branch: "Branch",
    requester: "Requester",
    credits: "Credits",
    reason: "Reason",
    note: "Headquarters' note",
  },
};

const CREDIT_TYPES = new Set<NotificationType>([
  "CREDIT_REQUEST_CREATED",
  "CREDIT_REQUEST_APPROVED",
  "CREDIT_REQUEST_REJECTED",
  "CREDIT_RENEWAL_CREATED",
  "CREDIT_REQUEST_EXPIRED",
  "BRANCH_TOPUP_REQUESTED",
  "BRANCH_CREDIT_REQUEST_APPROVED",
  "BRANCH_CREDIT_REQUEST_REJECTED",
  "BRANCH_CREDIT_REQUEST_EXPIRED",
  "CREDIT_TOPUP_COMPANY_APPROVED",
  "CREDIT_TOPUP_COMPANY_REJECTED",
]);

// The label/value rows under the text: whatever the notification links to.
const detailRows = (type: NotificationType, d: NotificationEmailData, lang: EmailLanguage, amount: string | null) => {
  const label = LABELS[lang];
  const rows: { label: string; value: string }[] = [];
  if (d.productName !== null && type !== "PLATFORM_ANNOUNCEMENT") {
    rows.push({ label: d.donationId !== null ? label.donation! : label.product!, value: d.productName });
  }
  if (d.reservationId !== null) {
    if (amount !== null) rows.push({ label: label.quantity!, value: amount });
    // The other party of the reservation.
    if (d.recipientRole === "STORE" && d.restaurantName) rows.push({ label: label.restaurant!, value: d.restaurantName });
    if (d.recipientRole === "RESTAURANT" && d.storeName) rows.push({ label: label.store!, value: d.storeName });
    if (d.pickupAt) rows.push({ label: label.pickup!, value: formatPickup(d.pickupAt, lang) });
  }
  if (CREDIT_TYPES.has(type)) {
    if (d.recipientRole === "ADMIN" && d.creditRequester !== null) {
      rows.push({ label: label.requester!, value: requesterName(d) });
    }
    if (d.credits !== null) rows.push({ label: label.credits!, value: String(d.credits) });
  }
  if (d.details) {
    rows.push({ label: type === "CREDIT_TOPUP_COMPANY_REJECTED" ? label.note! : label.reason!, value: d.details });
  }
  return rows;
};

const requesterName = (d: NotificationEmailData) =>
  d.creditCompany ? `${d.creditCompany} → ${d.creditRequester ?? ""}` : (d.creditRequester ?? "");

const renderNotificationEmail = (type: NotificationType) => (raw: unknown, lang: EmailLanguage, appUrl: string) => {
  const d = parseNotificationData(raw, type);
  const amount =
    d.quantity !== null && d.unit !== null ? `${formatQuantity(d.quantity, lang)} ${unitLabel(d.unit, lang)}` : null;
  const values: Values = {
    product: d.productName ?? "–",
    amount: amount ?? "",
    branch: d.branchName ?? d.creditRequester ?? "–",
    credits: d.credits === null ? "–" : String(d.credits),
    requester: requesterName(d) || "–",
    topup: d.creditRequestType === "TOPUP",
  };
  const link = notificationLink(type, d);
  const button = { label: BUTTONS[lang][link.kind], url: `${appUrl}${link.path}` };

  if (type === "PLATFORM_ANNOUNCEMENT") {
    // The announcement's own title and text, in English when the admin wrote one.
    const { title, body } = announcement(d, lang);
    const subject = lang === "en" ? `Platform announcement: ${title}` : `Obavještenje platforme: ${title}`;
    return renderLayout({ lang, subject, heading: title, intro: paragraphs(body), button });
  }
  const copy = COPY[lang][type](values, d);
  return renderLayout({
    lang,
    subject: copy.subject,
    heading: copy.heading,
    intro: copy.intro,
    details: detailRows(type, d, lang, amount),
    ...(copy.outro ? { outro: copy.outro } : {}),
    button,
  });
};

const NOTIFICATION_TYPES = Object.keys(COPY.bs) as NotificationType[];

// Every notification type has an email (the Record type makes a missing one a compile error).
export const NOTIFICATION_TEMPLATES = Object.fromEntries(
  NOTIFICATION_TYPES.map((type) => [type, { render: renderNotificationEmail(type) } satisfies EmailTemplate]),
) as Record<NotificationType, EmailTemplate>;
