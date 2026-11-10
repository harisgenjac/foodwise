import type { NotificationType } from "../../utils/notifications.js";
import { formatMoney, formatPickup, formatQuantity, unitLabel } from "./format.js";
import { EMAIL_SETTINGS_PATH, renderLayout, type EmailLanguage, type EmailLine } from "./layout.js";
import { parseNotificationData, type NotificationEmailData, type OrderLineData } from "./notificationData.js";
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
  // An order: "#K7PM", the parties, and for a partly accepted one the new and the sent total
  // ("52,50 KM"; newTotal is empty when the total did not change).
  code: string;
  store: string;
  restaurant: string;
  newTotal: string;
  orderedTotal: string;
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

const COPY: Record<EmailLanguage, Record<NotificationType, CopyFn>> = {
  bs: {
    ORDER_CREATED: (v) => ({
      subject: `Nova narudžba ${v.code} od ${v.restaurant}`,
      heading: `Nova narudžba ${v.code}`,
      intro: [`${v.restaurant} je poslao narudžbu ${v.code}.`],
      outro: ["Prihvatite ili odbijte stavke narudžbe u aplikaciji."],
    }),
    ORDER_CANCELLED: (v) => ({
      subject: `Narudžba ${v.code} je otkazana`,
      heading: "Narudžba je otkazana",
      intro: [`${v.restaurant} je otkazao narudžbu ${v.code}.`],
    }),
    ORDER_ACCEPTED: (v) => ({
      subject: `Narudžba ${v.code} je prihvaćena`,
      heading: "Narudžba je prihvaćena",
      intro: [`Prodavnica ${v.store} je prihvatila vašu narudžbu ${v.code}.`],
      outro: ["Preuzmite je u dogovoreno vrijeme."],
    }),
    ORDER_PARTIALLY_ACCEPTED: (v) => ({
      subject: `Narudžba ${v.code} je djelimično prihvaćena`,
      heading: "Narudžba je djelimično prihvaćena",
      intro: [
        `Prodavnica ${v.store} je prihvatila dio vaše narudžbe ${v.code}. Izmjene su navedene ispod.`,
        ...(v.newTotal ? [`Novi iznos: ${v.newTotal} umjesto ${v.orderedTotal}.`] : []),
      ],
      outro: ["Preuzmite prihvaćene stavke u dogovoreno vrijeme."],
    }),
    ORDER_REJECTED: (v) => ({
      subject: `Narudžba ${v.code} je odbijena`,
      heading: "Narudžba je odbijena",
      intro: [`Prodavnica ${v.store} je odbila vašu narudžbu ${v.code}.`],
    }),
    ORDER_COMPLETED: (v) => ({
      subject: `Narudžba ${v.code} je preuzeta`,
      heading: "Preuzimanje je potvrđeno",
      intro: [`Preuzimanje narudžbe ${v.code} je potvrđeno.`],
    }),
    ORDER_PICKUP_MISSED: (v) => ({
      subject: `Preuzimanje je propušteno: ${v.code}`,
      heading: "Preuzimanje je propušteno",
      intro: [`Narudžba ${v.code} je otkazana jer nije preuzeta na vrijeme.`],
    }),
    ORDER_PICKUP_TODAY: (v) => ({
      subject: `Podsjetnik: danas preuzimate narudžbu ${v.code}`,
      heading: "Danas je preuzimanje",
      intro: [`Danas preuzimate narudžbu ${v.code} (${v.store}).`],
    }),
    ORDER_ITEMS_EXPIRED: (v) => ({
      subject: `Dio narudžbe ${v.code} je otkazan`,
      heading: "Dio narudžbe je otkazan",
      intro: [
        `Neki proizvodi iz narudžbe ${v.code} su istekli prije odgovora prodavnice, pa su otkazani. Ostale stavke i dalje čekaju odgovor.`,
      ],
    }),
    ORDER_EXPIRED: (v) => ({
      subject: `Narudžba ${v.code} je otkazana`,
      heading: "Narudžba je otkazana",
      intro: [`Narudžba ${v.code} je otkazana jer su proizvodi istekli prije odgovora prodavnice.`],
    }),
    ORDER_ITEMS_REMOVED: (v) => ({
      subject: `Dio narudžbe ${v.code} je otkazan`,
      heading: "Dio narudžbe je otkazan",
      intro: [
        `Administrator platforme je uklonio neke proizvode iz ponude, pa su otkazani iz narudžbe ${v.code}. Ostale stavke i dalje čekaju odgovor.`,
      ],
    }),
    ORDER_CANCELLED_BY_ADMIN: (v) => ({
      subject: `Narudžba ${v.code} je otkazana`,
      heading: "Administrator je otkazao narudžbu",
      intro: [`Administrator platforme je otkazao narudžbu ${v.code}.`],
    }),
    ORDER_CANCELLED_STORE_CLOSED: (v) => ({
      subject: `Narudžba ${v.code} je otkazana`,
      heading: "Narudžba je otkazana",
      intro: [`Narudžba ${v.code} je otkazana jer prodavnica ${v.store} više nije aktivna.`],
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
    PASSWORD_CHANGED: () => ({
      subject: "Vaša lozinka je promijenjena",
      heading: "Lozinka je promijenjena",
      intro: ["Lozinka vašeg FoodWise računa je upravo promijenjena putem linka za novu lozinku. Sve prijave na drugim uređajima su odjavljene."],
      outro: ["Ako to niste bili vi, odmah zatražite novu lozinku na stranici za prijavu (Zaboravili ste lozinku?) i javite se administratoru."],
    }),
  },
  en: {
    ORDER_CREATED: (v) => ({
      subject: `New order ${v.code} from ${v.restaurant}`,
      heading: `New order ${v.code}`,
      intro: [`${v.restaurant} sent order ${v.code}.`],
      outro: ["Accept or reject the order's items in the app."],
    }),
    ORDER_CANCELLED: (v) => ({
      subject: `Order ${v.code} was cancelled`,
      heading: "Order cancelled",
      intro: [`${v.restaurant} cancelled order ${v.code}.`],
    }),
    ORDER_ACCEPTED: (v) => ({
      subject: `Order ${v.code} was accepted`,
      heading: "Order accepted",
      intro: [`${v.store} accepted your order ${v.code}.`],
      outro: ["Pick it up at the agreed time."],
    }),
    ORDER_PARTIALLY_ACCEPTED: (v) => ({
      subject: `Order ${v.code} was partly accepted`,
      heading: "Order partly accepted",
      intro: [
        `${v.store} accepted part of your order ${v.code}. The changes are listed below.`,
        ...(v.newTotal ? [`New total: ${v.newTotal} instead of ${v.orderedTotal}.`] : []),
      ],
      outro: ["Pick up the accepted items at the agreed time."],
    }),
    ORDER_REJECTED: (v) => ({
      subject: `Order ${v.code} was rejected`,
      heading: "Order rejected",
      intro: [`${v.store} rejected your order ${v.code}.`],
    }),
    ORDER_COMPLETED: (v) => ({
      subject: `Order ${v.code} was picked up`,
      heading: "Pickup confirmed",
      intro: [`The pickup of order ${v.code} was confirmed.`],
    }),
    ORDER_PICKUP_MISSED: (v) => ({
      subject: `Pickup missed: ${v.code}`,
      heading: "Pickup missed",
      intro: [`Order ${v.code} was cancelled because it was not picked up in time.`],
    }),
    ORDER_PICKUP_TODAY: (v) => ({
      subject: `Reminder: pick up order ${v.code} today`,
      heading: "Pickup today",
      intro: [`Pick up order ${v.code} today (${v.store}).`],
    }),
    ORDER_ITEMS_EXPIRED: (v) => ({
      subject: `Part of order ${v.code} was cancelled`,
      heading: "Part of the order was cancelled",
      intro: [
        `Some products of order ${v.code} expired before the store answered, so they were cancelled. The other items still wait for an answer.`,
      ],
    }),
    ORDER_EXPIRED: (v) => ({
      subject: `Order ${v.code} was cancelled`,
      heading: "Order cancelled",
      intro: [`Order ${v.code} was cancelled because its products expired before the store answered.`],
    }),
    ORDER_ITEMS_REMOVED: (v) => ({
      subject: `Part of order ${v.code} was cancelled`,
      heading: "Part of the order was cancelled",
      intro: [
        `The platform administrator removed some products from the offer, so they were cancelled from order ${v.code}. The other items still wait for an answer.`,
      ],
    }),
    ORDER_CANCELLED_BY_ADMIN: (v) => ({
      subject: `Order ${v.code} was cancelled`,
      heading: "An administrator cancelled an order",
      intro: [`The platform administrator cancelled order ${v.code}.`],
    }),
    ORDER_CANCELLED_STORE_CLOSED: (v) => ({
      subject: `Order ${v.code} was cancelled`,
      heading: "Order cancelled",
      intro: [`Order ${v.code} was cancelled because ${v.store} is no longer active.`],
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
    PASSWORD_CHANGED: () => ({
      subject: "Your password was changed",
      heading: "Your password was changed",
      intro: ["The password of your FoodWise account was just changed with a password reset link. Every session on other devices was signed out."],
      outro: ["If this was not you, ask for a new password on the login page (Forgot password?) right away and contact an administrator."],
    }),
  },
};

// Notifications whose email is a system email: sent even with email notifications off, and
// without the footer link to the switch.
export const SYSTEM_NOTIFICATION_TYPES: readonly NotificationType[] = ["PASSWORD_CHANGED"];

// Where the button goes, like getNotificationLink on the client (the same order of checks).
type LinkKind =
  | "reservation"
  | "order"
  | "product"
  | "donations"
  | "dashboard"
  | "credits"
  | "requests"
  | "branch"
  | "profile"
  | "list";

export const notificationLink = (type: NotificationType, d: NotificationEmailData): { path: string; kind: LinkKind } => {
  if (type === "BRANCH_TOPUP_REQUESTED") return { path: "/company/credits", kind: "credits" };
  if (type === "PASSWORD_CHANGED") return { path: "/my-profile", kind: "profile" };
  if (d.recipientRole === "COMPANY" && d.branchId !== null) {
    return { path: `/company/branches/${d.branchId}`, kind: "branch" };
  }
  if (d.orderId !== null) return { path: `/orders/${d.orderId}`, kind: "order" };
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
  return { path: d.recipientRole === "STORE" ? "/orders" : "/my-orders", kind: "list" };
};

const BUTTONS: Record<EmailLanguage, Record<LinkKind, string>> = {
  bs: {
    reservation: "Otvori rezervaciju",
    order: "Otvori narudžbu",
    product: "Otvori proizvod",
    donations: "Otvori donacije",
    dashboard: "Otvori FoodWise",
    credits: "Otvori kredite",
    requests: "Otvori zahtjeve",
    branch: "Otvori poslovnicu",
    profile: "Otvori profil",
    list: "Otvori narudžbe",
  },
  en: {
    reservation: "Open reservation",
    order: "Open order",
    product: "Open product",
    donations: "Open donations",
    dashboard: "Open FoodWise",
    credits: "Open credits",
    requests: "Open requests",
    branch: "Open branch",
    profile: "Open profile",
    list: "Open orders",
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
    order: "Narudžba",
    total: "Ukupno",
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
    order: "Order",
    total: "Total",
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
  if (d.orderId !== null && d.orderCode !== null) rows.push({ label: label.order!, value: `#${d.orderCode}` });
  if (d.reservationId !== null || d.orderId !== null) {
    if (d.reservationId !== null && amount !== null) rows.push({ label: label.quantity!, value: amount });
    // The other party.
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

const CHANGE_REASONS: Record<EmailLanguage, Record<string, string>> = {
  bs: { NOT_ENOUGH_STOCK: "nema dovoljno na stanju", QUALITY: "kvalitet", OTHER: "drugo" },
  en: { NOT_ENOUGH_STOCK: "not enough in stock", QUALITY: "quality", OTHER: "other" },
};

const LINE_TEXT: Record<EmailLanguage, { less: (accepted: string, ordered: string) => string; rejected: string; cancelled: string }> = {
  bs: { less: (accepted, ordered) => `${accepted} od ${ordered}`, rejected: "Odbijeno", cancelled: "Otkazano" },
  en: { less: (accepted, ordered) => `${accepted} of ${ordered}`, rejected: "Rejected", cancelled: "Cancelled" },
};

// A line that still counts: neither rejected by the store nor cancelled.
const isLive = (line: OrderLineData) => line.status !== "Rejected" && line.status !== "Cancelled";

const lineAmount = (line: OrderLineData, quantity: string) => Number(line.unitPrice) * Number(quantity);

// The order's lines for the email table: "Piletina, 15 kg · 52,50 KM" with the change under it
// ("15 kg od 20 kg · nema dovoljno na stanju", "Odbijeno · kvalitet"); rejected and cancelled
// lines are struck through.
const orderLines = (lines: OrderLineData[], lang: EmailLanguage): EmailLine[] =>
  lines.map((line) => {
    const unit = unitLabel(line.unit, lang);
    const amount = (quantity: string) => `${formatQuantity(quantity, lang)} ${unit}`;
    const text = LINE_TEXT[lang];
    const live = isLive(line);
    const reduced = live && Number(line.quantity) < Number(line.ordered);
    const reason = line.reason ? (line.note ?? CHANGE_REASONS[lang][line.reason] ?? line.reason) : null;
    const change = reduced
      ? text.less(amount(line.quantity), amount(line.ordered))
      : line.status === "Rejected"
        ? text.rejected
        : line.status === "Cancelled"
          ? text.cancelled
          : null;
    const note = [change, reason].filter(Boolean).join(" · ");
    return {
      label: `${line.product}, ${amount(live ? line.quantity : line.ordered)}`,
      value: formatMoney(String(lineAmount(line, live ? line.quantity : line.ordered)), lang),
      ...(note ? { note } : {}),
      ...(live ? {} : { struck: true }),
    };
  });

// The current total (lines that still count) and the total the order sent.
const orderTotals = (lines: OrderLineData[]) => ({
  current: lines.filter(isLive).reduce((sum, line) => sum + lineAmount(line, line.quantity), 0),
  ordered: lines.reduce((sum, line) => sum + lineAmount(line, line.ordered), 0),
});

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
    code: d.orderCode ? `#${d.orderCode}` : "–",
    store: d.storeName ?? "–",
    restaurant: d.restaurantName ?? "–",
    newTotal: "",
    orderedTotal: "",
  };
  const lines = d.orderLines ?? [];
  const totals = orderTotals(lines);
  if (lines.length > 0 && Math.round(totals.current * 100) !== Math.round(totals.ordered * 100)) {
    values.newTotal = formatMoney(String(totals.current), lang);
    values.orderedTotal = formatMoney(String(totals.ordered), lang);
  }
  const link = notificationLink(type, d);
  const button = { label: BUTTONS[lang][link.kind], url: `${appUrl}${link.path}` };
  // A system email cannot be turned off, so it has no link to the switch.
  const settingsUrl = SYSTEM_NOTIFICATION_TYPES.includes(type) ? undefined : `${appUrl}${EMAIL_SETTINGS_PATH}`;

  if (type === "PLATFORM_ANNOUNCEMENT") {
    // The announcement's own title and text, in English when the admin wrote one.
    const { title, body } = announcement(d, lang);
    const subject = lang === "en" ? `Platform announcement: ${title}` : `Obavještenje platforme: ${title}`;
    return renderLayout({ lang, subject, heading: title, intro: paragraphs(body), button, ...(settingsUrl ? { settingsUrl } : {}) });
  }
  const copy = COPY[lang][type](values, d);
  return renderLayout({
    lang,
    subject: copy.subject,
    heading: copy.heading,
    intro: copy.intro,
    details: detailRows(type, d, lang, amount),
    ...(lines.length > 0 ? { lines: orderLines(lines, lang) } : {}),
    // No total when nothing is left (a rejected or cancelled order).
    ...(lines.some(isLive)
      ? { total: { label: LABELS[lang].total!, value: formatMoney(String(totals.current), lang) } }
      : {}),
    ...(copy.outro ? { outro: copy.outro } : {}),
    button,
    ...(settingsUrl ? { settingsUrl } : {}),
  });
};

const NOTIFICATION_TYPES = Object.keys(COPY.bs) as NotificationType[];

// Every notification type has an email (the Record type makes a missing one a compile error).
export const NOTIFICATION_TEMPLATES = Object.fromEntries(
  NOTIFICATION_TYPES.map((type) => [
    type,
    {
      ...(SYSTEM_NOTIFICATION_TYPES.includes(type) ? { system: true } : {}),
      render: renderNotificationEmail(type),
    } satisfies EmailTemplate,
  ]),
) as Record<NotificationType, EmailTemplate>;
