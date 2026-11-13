// Replaces ALL data with a demo platform that looks like it has been in use for two months:
// the stores, restaurants and admins from seedData.ts, with products, orders, donations,
// the stores' subscriptions and credits (restaurants pay none), favorites, notifications,
// announcements and admin actions spread over the last HISTORY_DAYS days. The history is
// simulated day by day and every credit movement goes through creditService with the simulated
// time, so balances follow the real rules. Random choices
// use a fixed seed, so every run gives the same data relative to the day it runs.
//
// Usage: npm run seed
import "dotenv/config";
import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { ORDER_CODE_ALPHABET, ORDER_CODE_LENGTH } from "../services/orders/codes.js";
import { availableQuantity, sellableProduct } from "../services/stock.js";
import { APP_TIMEZONE, todayInAppTimezone } from "../utils/dates.js";
import { creditMonth, nextMonth } from "../utils/creditTime.js";
import {
  adjustCredits,
  chargeForProduct,
  getBalance,
  grantPlan,
  grantTopup,
  refundForProduct,
  type ActorRef,
} from "../services/creditService.js";
import {
  ADMINS,
  ANNOUNCEMENTS,
  COMPANIES,
  MEAL_TEMPLATES,
  PRODUCT_TEMPLATES,
  RESTAURANTS,
  SEED_PASSWORD,
  STORES,
  type SeedBusiness,
  type SeedStore,
} from "./seedData.js";

const HISTORY_DAYS = 61;
const PENDING_NOW = 25;
const CONFIRMED_NOW = 20;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---------- Random (mulberry32 with a fixed seed) ----------

let randomState = 20260823;
const random = () => {
  randomState = (randomState + 0x6d2b79f5) | 0;
  let t = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const chance = (probability: number) => random() < probability;
const between = (min: number, max: number) => min + random() * (max - min);
const randomInt = (min: number, max: number) => Math.floor(between(min, max + 1));
const pick = <T>(items: readonly T[]): T => {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("pick called with an empty array");
  return item;
};
const shuffle = <T>(items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};
const roundPrice = (value: number) => Math.round(value * 10) / 10;

// ---------- Time (business days and hours in APP_TIMEZONE) ----------

const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, timeZoneName: "longOffset" });
const hourFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const offsetMinutes = (instant: Date) => {
  const name = offsetFormat.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value ?? "";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
};

// The instant of a local wall-clock time; `hours` may be fractional (14.5 = 14:30).
const at = (day: string, hours: number): Date => {
  const wall = Date.parse(`${day}T00:00:00Z`) + Math.round(hours * 60) * 60000;
  const guess = wall - offsetMinutes(new Date(wall)) * 60000;
  return new Date(wall - offsetMinutes(new Date(guess)) * 60000);
};
const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const addHours = (instant: Date, hours: number) => new Date(instant.getTime() + hours * HOUR_MS);
const localDay = (instant: Date) => dayFormat.format(instant);
const localHour = (instant: Date) => {
  const [hours, minutes] = hourFormat.format(instant).split(":").map(Number);
  return (hours ?? 0) + (minutes ?? 0) / 60;
};
const earlier = (a: Date, b: Date) => (a < b ? a : b);

const now = new Date();
const today = todayInAppTimezone();
const yesterday = addDays(today, -1);
const startDay = addDays(today, -HISTORY_DAYS);

// ---------- In-memory model ----------

interface Business {
  id: number;
  role: "STORE" | "RESTAURANT";
  data: SeedBusiness;
  store: SeedStore | null;
  createdAt: Date;
  activeFrom: Date;
  favorites: Business[];
}

interface SimProduct {
  id: number;
  store: Business;
  name: string;
  unit: string;
  category: string;
  quantity: number;
  price: number;
  expiry: string;
  postedAt: Date;
  // Held by Pending, Confirmed and Completed order items and shop sales; `confirmed` what keeps it
  // sold out (Confirmed and Completed items and shop sales).
  held: number;
  confirmed: number;
  soldAt: Date | null;
  // Taken off the marketplace: no new orders.
  frozen: boolean;
  // Sold out by "Sold in shop" (the store's own till): no "sold out" notification.
  soldOutInShop?: boolean;
  removedAt: Date | null;
}

interface Admin {
  id: number;
  email: string;
}

const counts = { products: 0, orders: 0, items: 0, donations: 0, notifications: 0, topups: 0, shopSales: 0 };

// ---------- Inserts with explicit timestamps ----------

interface NotificationLinks {
  orderId?: number;
  productId?: number;
  donationId?: number;
  creditRequestId?: number;
  announcementId?: number;
  branchId?: number;
  details?: string;
}

// Older notifications are mostly read; the last few days are mostly unread.
const notify = async (
  client: PoolClient,
  userId: number,
  type: string,
  message: string,
  createdAt: Date,
  links: NotificationLinks = {},
) => {
  const isRead = now.getTime() - createdAt.getTime() > 3 * DAY_MS ? chance(0.95) : chance(0.3);
  await client.query(
    `INSERT INTO notifications
       (user_id, type, message, order_id, product_id, donation_id, credit_request_id, announcement_id, details,
        is_read, created_at, branch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      userId,
      type,
      message,
      links.orderId ?? null,
      links.productId ?? null,
      links.donationId ?? null,
      links.creditRequestId ?? null,
      links.announcementId ?? null,
      links.details ?? null,
      isRead,
      createdAt,
      links.branchId ?? null,
    ],
  );
  counts.notifications++;
};

interface AdminActionTargets {
  userId?: number;
  productId?: number;
  donationId?: number;
  reservationId?: number;
  orderId?: number;
  announcementId?: number;
  creditRequestId?: number;
  companyId?: number;
  reason?: string;
}

const logAction = async (client: PoolClient, admin: Admin, action: string, createdAt: Date, targets: AdminActionTargets = {}) => {
  await client.query(
    `INSERT INTO admin_actions
       (admin_id, action, target_user_id, target_product_id, target_donation_id, target_reservation_id,
        target_order_id, target_announcement_id, target_credit_request_id, target_company_id, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      admin.id,
      action,
      targets.userId ?? null,
      targets.productId ?? null,
      targets.donationId ?? null,
      targets.reservationId ?? null,
      targets.orderId ?? null,
      targets.announcementId ?? null,
      targets.creditRequestId ?? null,
      targets.companyId ?? null,
      targets.reason ?? null,
      createdAt,
    ],
  );
};

// ---------- Seed ----------

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Deleting existing data...");
    // Orders, admin actions, announcements and the credit ledger reference users with
    // RESTRICT; everything else cascades from users, and companies go after their users
    // (users.company_id is RESTRICT). The ledger is append-only and allows
    // deletes only with app.ledger_maintenance on (set for this transaction only).
    await client.query("SET LOCAL app.ledger_maintenance = 'on'");
    await client.query("DELETE FROM credit_transactions");
    await client.query("DELETE FROM admin_actions");
    await client.query("DELETE FROM notifications");
    await client.query("DELETE FROM announcements");
    // Their items, history and shop-sale links go with them.
    await client.query("DELETE FROM orders");
    await client.query("DELETE FROM donation_offers");
    await client.query("DELETE FROM products");
    await client.query("DELETE FROM users");
    await client.query("DELETE FROM companies");

    const plans = new Map<string, number>();
    for (const row of (await client.query<{ id: number; name: string }>("SELECT id, name FROM plans")).rows) {
      plans.set(row.name, row.id);
    }
    const packages = new Map<number, number>();
    for (const row of (await client.query<{ id: number; credits: number }>("SELECT id, credits FROM topup_packages")).rows) {
      packages.set(row.credits, row.id);
    }
    const planId = (name: string) => {
      const id = plans.get(name);
      if (id === undefined) throw new Error(`Plan ${name} does not exist; run the migrations first.`);
      return id;
    };
    const packageId = (credits: number) => {
      const id = packages.get(credits);
      if (id === undefined) throw new Error(`Top-up package of ${credits} credits does not exist.`);
      return id;
    };

    // ----- Accounts -----
    console.log("Creating accounts...");
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    const admins: Admin[] = [];
    for (const [index, admin] of ADMINS.entries()) {
      const createdAt = at(startDay, 8 + index * 0.5);
      const result = await client.query<{ id: number }>(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, created_at)
         VALUES ($1, $2, $3, $4, 'ADMIN', $5) RETURNING id`,
        [admin.first_name, admin.last_name, admin.email, passwordHash, createdAt],
      );
      admins.push({ id: result.rows[0]!.id, email: admin.email });
      if (index > 0) await logAction(client, admins[0]!, "CREATE_USER", createdAt, { userId: result.rows[0]!.id });
    }
    const [mainAdmin, secondAdmin] = [admins[0]!, admins[1]!];

    // Companies (store chains) with their headquarters login; the demo login has its profile
    // filled in and no temporary password, like the other demo accounts.
    const companyIds = new Map<string, number>();
    // The headquarters login of each company, which asks and pays for its branches' credits.
    const hqIds = new Map<string, number>();
    for (const [index, company] of COMPANIES.entries()) {
      const createdAt = at(startDay, 9 + index * 0.5);
      const companyRow = await client.query<{ id: number }>(
        "INSERT INTO companies (name, description, created_at, updated_at) VALUES ($1, $2, $3, $3) RETURNING id",
        [company.name, company.description, createdAt],
      );
      const id = companyRow.rows[0]!.id;
      companyIds.set(company.name, id);
      const hq = await client.query<{ id: number }>(
        `INSERT INTO users (first_name, last_name, phone, email, password_hash, role, company_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 'COMPANY', $6, $7) RETURNING id`,
        [company.hq.first_name, company.hq.last_name, company.hq.phone, company.hq.email, passwordHash, id, createdAt],
      );
      hqIds.set(company.name, hq.rows[0]!.id);
      await logAction(client, mainAdmin, "CREATE_COMPANY", createdAt, { companyId: id });
    }
    const anyAdmin = () => pick(admins);

    // Seed businesses name their city; the cities table (filled by a migration) holds the ids.
    const cityRows = await client.query<{ id: number; name: string }>("SELECT cities.id, cities.name FROM cities");
    const cityIds = new Map(cityRows.rows.map((row) => [row.name, row.id]));
    const cityId = (name: string) => {
      const id = cityIds.get(name);
      if (id === undefined) throw new Error(`Unknown seed city: ${name}`);
      return id;
    };

    const createBusiness = async (data: SeedBusiness, role: "STORE" | "RESTAURANT", index: number): Promise<Business> => {
      const createdAt = at(addDays(startDay, Math.floor(index * (role === "STORE" ? 0.5 : 0.6))), between(9, 16));
      const companyName = role === "STORE" ? (data as SeedStore).company : undefined;
      const companyId = companyName === undefined ? null : companyIds.get(companyName);
      if (companyId === undefined) throw new Error(`Unknown seed company: ${companyName}`);
      const result = await client.query<{ id: number }>(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, business_name, city_id, phone, address,
                            opening_hours, pickup_hours, description, company_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [
          data.first_name, data.last_name, data.email, passwordHash, role, data.business_name, cityId(data.city), data.phone,
          data.address, data.opening_hours, data.pickup_hours || null, data.description ?? null, companyId, createdAt,
        ],
      );
      const id = result.rows[0]!.id;
      // A branch is created by its headquarters, not by an admin, so it has no admin action.
      if (companyId === null) await logAction(client, mainAdmin, "CREATE_USER", createdAt, { userId: id });
      return {
        id,
        role,
        data,
        store: role === "STORE" ? (data as SeedStore) : null,
        createdAt,
        activeFrom: createdAt,
        favorites: [],
      };
    };
    const stores: Business[] = [];
    for (const [index, store] of STORES.entries()) stores.push(await createBusiness(store, "STORE", index));
    const restaurants: Business[] = [];
    for (const [index, restaurant] of RESTAURANTS.entries()) {
      restaurants.push(await createBusiness(restaurant, "RESTAURANT", index));
    }
    const businesses = [...stores, ...restaurants];
    const byEmail = (email: string) => {
      const business = businesses.find((b) => b.data.email === email);
      if (!business) throw new Error(`Unknown demo business ${email}`);
      return business;
    };

    // ----- Credit requests and subscriptions -----
    console.log("Creating subscriptions and credit requests...");
    interface RequestInput {
      user: Business;
      type: "SUBSCRIPTION" | "TOPUP";
      plan?: string;
      credits?: number;
      periodMonth: string;
      autoRenew?: boolean;
      source?: "USER" | "AUTO_RENEW";
      createdAt: Date;
      status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED" | "COMPANY_REVIEW";
      reviewedAt?: Date;
      note?: string;
      // A branch's own top-up: it asks its headquarters, which forwards it at this time (unset =
      // still waiting for the headquarters).
      fromBranch?: boolean;
      companyApprovedAt?: Date;
    }
    // Mirrors the app: the user (or the renewal job) asks, the admins are told, an admin decides.
    // A branch's requests are sent by its headquarters (source COMPANY), or asked by the branch
    // and forwarded by the headquarters (source BRANCH); its headquarters hears of the decision too.
    const creditRequest = async (input: RequestInput) => {
      const reviewer = input.status === "APPROVED" || input.status === "REJECTED" ? anyAdmin() : null;
      const company = input.user.store?.company;
      const hqId = company === undefined ? undefined : hqIds.get(company);
      let source: string = input.source ?? "USER";
      let requestedBy: number | null = source === "AUTO_RENEW" ? null : input.user.id;
      if (hqId !== undefined && source === "USER") {
        source = input.fromBranch ? "BRANCH" : "COMPANY";
        requestedBy = input.fromBranch && !input.companyApprovedAt ? input.user.id : hqId;
      }
      const result = await client.query<{ id: number }>(
        `INSERT INTO credit_requests
           (user_id, request_type, plan_id, topup_package_id, period_month, auto_renew, status, admin_note,
            created_at, reviewed_by, reviewed_at, source, requested_by, company_reviewed_by, company_reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [
          input.user.id,
          input.type,
          input.plan ? planId(input.plan) : null,
          input.credits ? packageId(input.credits) : null,
          input.periodMonth,
          input.autoRenew ?? false,
          input.status,
          input.note ?? null,
          input.createdAt,
          reviewer?.id ?? null,
          reviewer ? (input.reviewedAt ?? null) : null,
          source,
          requestedBy,
          input.companyApprovedAt ? hqId : null,
          input.companyApprovedAt ?? null,
        ],
      );
      const requestId = result.rows[0]!.id;
      const kind = input.type === "SUBSCRIPTION" ? "subscription" : "top-up";
      let sentToAdminsAt = input.createdAt;
      if (input.fromBranch && hqId !== undefined) {
        await notify(client, hqId, "BRANCH_TOPUP_REQUESTED", "A branch asks for extra credits.", input.createdAt, {
          creditRequestId: requestId,
          branchId: input.user.id,
        });
        if (!input.companyApprovedAt) return requestId;
        sentToAdminsAt = input.companyApprovedAt;
        await notify(client, input.user.id, "CREDIT_TOPUP_COMPANY_APPROVED", "Your company sent your top-up request for approval.", sentToAdminsAt, {
          creditRequestId: requestId,
        });
      }
      const createdMessage = input.source === "AUTO_RENEW"
        ? "New subscription renewal waiting for approval."
        : `New ${kind} request waiting for approval.`;
      for (const admin of admins) {
        await notify(client, admin.id, "CREDIT_REQUEST_CREATED", createdMessage, sentToAdminsAt, { creditRequestId: requestId });
      }
      if (!reviewer || !input.reviewedAt) return requestId;

      const by: ActorRef = { actor: "ADMIN", userId: reviewer.id };
      if (input.status === "APPROVED") {
        if (input.type === "SUBSCRIPTION") {
          const granted = await grantPlan(
            client,
            {
              userId: input.user.id,
              planId: planId(input.plan!),
              periodMonth: input.periodMonth,
              autoRenew: input.autoRenew ?? false,
              requestId,
              by,
            },
            input.reviewedAt,
          );
          await client.query("UPDATE subscriptions SET created_at = $1 WHERE id = $2", [input.reviewedAt, granted.subscription.id]);
        } else {
          await grantTopup(client, { userId: input.user.id, packageId: packageId(input.credits!), requestId, by }, input.reviewedAt);
          counts.topups++;
        }
      }
      await logAction(client, reviewer, input.status === "APPROVED" ? "APPROVE_CREDIT_REQUEST" : "REJECT_CREDIT_REQUEST", input.reviewedAt, {
        userId: input.user.id,
        creditRequestId: requestId,
        ...(input.note ? { reason: input.note } : {}),
      });
      await notify(
        client,
        input.user.id,
        input.status === "APPROVED" ? "CREDIT_REQUEST_APPROVED" : "CREDIT_REQUEST_REJECTED",
        `Your ${kind} request was ${input.status === "APPROVED" ? "approved" : "rejected"}.`,
        input.reviewedAt,
        { creditRequestId: requestId },
      );
      if (hqId !== undefined) {
        await notify(
          client,
          hqId,
          input.status === "APPROVED" ? "BRANCH_CREDIT_REQUEST_APPROVED" : "BRANCH_CREDIT_REQUEST_REJECTED",
          `A branch ${kind} request was ${input.status === "APPROVED" ? "approved" : "rejected"}.`,
          input.reviewedAt,
          { creditRequestId: requestId, branchId: input.user.id },
        );
      }
      return requestId;
    };

    const months: string[] = [];
    for (let day = startDay; day <= today; day = addDays(day, 1)) {
      const month = creditMonth(at(day, 12));
      if (!months.includes(month)) months.push(month);
    }
    const planFor = (business: Business, monthIndex: number) =>
      business.store!.plans[Math.min(monthIndex, business.store!.plans.length - 1)]!;

    // Only stores subscribe: restaurants order for free from the moment their account exists.
    for (const business of stores) {
      const { autoRenew } = business.store!;
      // First month: subscribe right after the account is created; nothing happens before approval.
      const firstAsked = addHours(business.createdAt, between(0.2, 0.6));
      const firstApproved = addHours(firstAsked, between(1, 3));
      const firstIndex = months.indexOf(creditMonth(firstApproved));
      await creditRequest({
        user: business, type: "SUBSCRIPTION", plan: planFor(business, firstIndex), periodMonth: months[firstIndex]!,
        autoRenew, createdAt: firstAsked, status: "APPROVED", reviewedAt: firstApproved,
      });
      business.activeFrom = firstApproved;

      for (let index = firstIndex + 1; index < months.length; index++) {
        const monthStart = months[index]!;
        const plan = planFor(business, index);
        if (business.data.email === "market.neretva@demo.com" && index === 1) {
          await creditRequest({
            user: business, type: "SUBSCRIPTION", plan: "Pro", periodMonth: monthStart, createdAt: at(monthStart, 7.5),
            status: "REJECTED", reviewedAt: at(monthStart, 7.8),
            note: "Uplata za Pro paket nije evidentirana. Pošaljite novi zahtjev nakon uplate.",
          });
        }
        if (plan !== planFor(business, index - 1)) {
          // Plan change: asked a few days before the month starts, approved the next day.
          const asked = at(addDays(monthStart, -4), between(10, 15));
          await creditRequest({
            user: business, type: "SUBSCRIPTION", plan, periodMonth: monthStart, autoRenew,
            createdAt: asked, status: "APPROVED", reviewedAt: at(addDays(monthStart, -3), between(9, 12)),
          });
        } else if (autoRenew) {
          // The renewal job runs at 00:10 London two days before the month and an admin approves it.
          await creditRequest({
            user: business, type: "SUBSCRIPTION", plan, periodMonth: monthStart, autoRenew: true, source: "AUTO_RENEW",
            createdAt: at(addDays(monthStart, -2), 1 + 10 / 60), status: "APPROVED",
            reviewedAt: at(addDays(monthStart, -1), between(9, 12)),
          });
        } else {
          const asked = at(monthStart, between(8, 8.3));
          await creditRequest({
            user: business, type: "SUBSCRIPTION", plan, periodMonth: monthStart, createdAt: asked,
            status: "APPROVED", reviewedAt: addHours(asked, between(0.3, 0.8)),
          });
        }
      }
    }

    // A withdrawn top-up, one left undecided until its month ended, and a manual adjustment.
    if (months.length > 1) {
      const zeleni = byEmail("zeleni.market@demo.com");
      await creditRequest({
        user: zeleni, type: "TOPUP", credits: 20, periodMonth: months[1]!,
        createdAt: at(addDays(months[1]!, 9), 10.2), status: "CANCELLED",
      });
      const bio = byEmail("bio.kutak@demo.com");
      await creditRequest({
        user: bio, type: "TOPUP", credits: 10, periodMonth: months[0]!,
        createdAt: at(addDays(months[1]!, -2), 18.5), status: "EXPIRED",
      });
      const pekara = byEmail("pekara.dobra@demo.com");
      const adjustedAt = at(addDays(months[1]!, 11), 11.3);
      const reason = "Kompenzacija za kredite potrošene tokom tehničkog problema.";
      await adjustCredits(client, { userId: pekara.id, amount: 5, reason, by: { actor: "ADMIN", userId: mainAdmin.id } }, adjustedAt);
      await logAction(client, mainAdmin, "ADJUST_CREDITS", adjustedAt, { userId: pekara.id, reason: `+5: ${reason}` });
    }

    // ----- Favorites and product templates -----
    for (const restaurant of restaurants) {
      const local = shuffle(stores.filter((store) => store.data.city === restaurant.data.city));
      const others = shuffle(stores.filter((store) => store.data.city !== restaurant.data.city));
      restaurant.favorites = [...local, ...others].slice(0, randomInt(2, Math.min(5, local.length + 1)));
      for (const store of restaurant.favorites) {
        await client.query("INSERT INTO favorites (restaurant_id, store_id, created_at) VALUES ($1, $2, $3)", [
          restaurant.id,
          store.id,
          addHours(restaurant.activeFrom, between(2, 24 * 10)),
        ]);
      }
    }
    for (const store of stores.slice(0, 6)) {
      const templates = shuffle(PRODUCT_TEMPLATES.filter((t) => store.store!.categories.includes(t.category)));
      for (const template of templates.slice(0, randomInt(3, 6))) {
        const originalPrice = roundPrice(between(...template.price));
        const createdAt = addHours(store.activeFrom, between(1, 24 * 14));
        await client.query(
          `INSERT INTO product_templates
             (store_id, name, description, category, unit, original_price, discounted_price, quantity, shelf_life_days,
              created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
          [
            store.id, template.name, template.description, template.category, template.unit, originalPrice,
            roundPrice(originalPrice * 0.55), randomInt(...template.quantity), randomInt(3, 7), createdAt,
          ],
        );
      }
    }

    // ----- Simulation helpers -----
    const products: SimProduct[] = [];
    const orderStatusCount: Record<string, number> = {};

    const hasCredit = async (business: Business, instant: Date) =>
      (await getBalance(client, business.id, instant)).available >= 1;

    const publishProduct = async (store: Business, postedAt: Date, expiry: string): Promise<SimProduct | null> => {
      if (!(await hasCredit(store, postedAt))) return null;
      const template = pick(PRODUCT_TEMPLATES.filter((t) => store.store!.categories.includes(t.category)));
      const originalPrice = roundPrice(between(...template.price));
      const price = roundPrice(originalPrice * between(0.4, 0.7));
      const quantity = randomInt(...template.quantity);
      const result = await client.query<{ id: number }>(
        `INSERT INTO products
           (store_id, name, description, category, original_price, discounted_price, quantity, unit, expiry_date,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
        [store.id, template.name, template.description, template.category, originalPrice, price, quantity, template.unit, expiry, postedAt],
      );
      const product: SimProduct = {
        id: result.rows[0]!.id, store, name: template.name, unit: template.unit, category: template.category,
        quantity, price, expiry, postedAt, held: 0, confirmed: 0, soldAt: null, frozen: false, removedAt: null,
      };
      await chargeForProduct(client, store.id, { id: product.id, category: product.category }, postedAt);
      products.push(product);
      counts.products++;
      return product;
    };

    const candidatesFor = (restaurant: Business, instant: Date, minLeft: number, lastDay: string) => {
      const open = products.filter(
        (p) =>
          p.store.data.city === restaurant.data.city &&
          !p.frozen &&
          p.postedAt < instant &&
          p.store.activeFrom < instant &&
          p.quantity - p.held >= minLeft &&
          p.expiry >= localDay(instant) &&
          p.expiry >= lastDay,
      );
      const favorites = open.filter((p) => restaurant.favorites.includes(p.store));
      return favorites.length > 0 && chance(0.6) ? favorites : open;
    };

    // A pickup time inside the store's pickup window on `day`, at least an hour after `after`;
    // null when the window has already passed that day.
    const pickupOn = (store: Business, day: string, after: Date): Date | null => {
      const [from, to] = store.store!.pickup;
      const earliest = localDay(after) === day ? Math.max(from, localHour(after) + 1) : from;
      if (earliest > to - 0.25) return null;
      return at(day, between(earliest, to - 0.25));
    };

    // ----- Orders -----
    // Orders are written with the same shapes the order service writes (orders, items, history,
    // codes, notifications), with 1 to 5 items from one store.
    const orderCodes = new Map<number, Set<string>>();
    // Random like the rest of the seed (the app draws codes with crypto.randomInt), unique per store.
    const drawCode = (storeId: number) => {
      const used = orderCodes.get(storeId) ?? new Set<string>();
      orderCodes.set(storeId, used);
      for (;;) {
        const code = Array.from({ length: ORDER_CODE_LENGTH }, () => pick([...ORDER_CODE_ALPHABET])).join("");
        if (!used.has(code)) {
          used.add(code);
          return code;
        }
      }
    };

    type ChangeReason = "NOT_ENOUGH_STOCK" | "QUALITY" | "OTHER";
    interface NewLine {
      product: SimProduct;
      // What the order sent, and what the store accepted (the same unless it accepted less).
      ordered: number;
      quantity: number;
      status: string;
      reason?: ChangeReason | null;
      note?: string | null;
    }
    interface OrderEvent {
      at: Date;
      to: string;
      source: "RESTAURANT" | "STORE" | "ADMIN" | "SYSTEM";
      actorId?: number | null;
      reason?: string | null;
      // Item rows when items moved differently (indexes into `lines`).
      items?: { index: number; from: string; to: string }[];
    }
    interface NewOrder {
      restaurant: Business;
      lines: NewLine[];
      status: string;
      createdAt: Date;
      pickupAt: Date;
      acceptPartial: boolean;
      sendChanges?: object[];
      decidedAt?: Date | null;
      pickedUpAt?: Date | null;
      updatedAt: Date;
      // After the creation row.
      events: OrderEvent[];
    }
    interface InsertedOrder {
      id: number;
      code: string;
      itemIds: number[];
    }

    const insertOrder = async (o: NewOrder): Promise<InsertedOrder> => {
      const store = o.lines[0]!.product.store;
      const code = drawCode(store.id);
      const order = await client.query<{ id: number }>(
        `INSERT INTO orders
           (store_id, restaurant_id, code, status, pickup_at, accept_partial, decided_at, send_changes, picked_up_at,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          store.id, o.restaurant.id, code, o.status, o.pickupAt, o.acceptPartial, o.decidedAt ?? null,
          JSON.stringify(o.sendChanges ?? []), o.pickedUpAt ?? null, o.createdAt, o.updatedAt,
        ],
      );
      const id = order.rows[0]!.id;
      const itemIds: number[] = [];
      for (const line of o.lines) {
        const decided = line.status !== "Pending" && o.decidedAt ? o.decidedAt : null;
        const item = await client.query<{ id: number }>(
          `INSERT INTO reservations
             (order_id, product_id, restaurant_id, quantity, ordered_quantity, unit_price, status, pickup_date,
              picked_up_at, decided_at, change_reason, change_note, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
          [
            id, line.product.id, o.restaurant.id, line.quantity, line.ordered, line.product.price, line.status, o.pickupAt,
            line.status === "Completed" ? (o.pickedUpAt ?? null) : null, decided, line.reason ?? null, line.note ?? null,
            o.createdAt, o.updatedAt,
          ],
        );
        itemIds.push(item.rows[0]!.id);
      }
      const history = async (itemId: number | null, from: string | null, to: string, event: Omit<OrderEvent, "to">) =>
        client.query(
          `INSERT INTO order_status_history (order_id, item_id, from_status, to_status, source, actor_id, reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, itemId, from, to, event.source, event.actorId ?? null, event.reason ?? null, event.at],
        );
      await history(null, null, "Pending", { at: o.createdAt, source: "RESTAURANT", actorId: o.restaurant.id });
      let current = "Pending";
      for (const event of o.events) {
        for (const item of event.items ?? []) await history(itemIds[item.index]!, item.from, item.to, event);
        if (event.to !== current) {
          await history(null, current, event.to, event);
          current = event.to;
        }
      }
      await notify(
        client, store.id, "ORDER_CREATED",
        `New order #${code}: ${o.lines.length} ${o.lines.length === 1 ? "item" : "items"}.`, o.createdAt, { orderId: id },
      );
      counts.orders++;
      counts.items += o.lines.length;
      return { id, code, itemIds };
    };
    const countStatus = (label: string) => {
      orderStatusCount[label] = (orderStatusCount[label] ?? 0) + 1;
    };
    // The lines' accepted quantities now cover their products (Confirmed or Completed).
    const cover = (lines: NewLine[], at: Date) => {
      for (const line of lines) {
        if (line.status !== "Confirmed" && line.status !== "Completed") continue;
        line.product.confirmed += line.quantity;
        if (line.product.confirmed >= line.product.quantity && !line.product.soldAt) line.product.soldAt = at;
      }
    };
    // The store sold the rest in its own shop while deciding (recorded from the order).
    const shopSaleFromOrder = async (product: SimProduct, amount: number, orderId: number, at: Date) => {
      await client.query(
        `INSERT INTO product_shop_sales (product_id, store_id, quantity, created_by, order_id, created_at)
         VALUES ($1, $2, $3, $2, $4, $5)`,
        [product.id, product.store.id, amount, orderId, at],
      );
      counts.shopSales++;
      product.held += amount;
      product.confirmed += amount;
      if (product.confirmed >= product.quantity && !product.soldAt) product.soldAt = at;
    };

    const OTHER_NOTES = ["Ambalaža je oštećena.", "Proizvod je zadržan za internu kontrolu.", "Pogrešno upisana cijena."];

    let adminCancels = 0;
    let adminProductRemovals = 0;

    // The lines of one order from the history: the first product and sometimes more of the same store.
    const historyLines = (restaurant: Business, createdAt: Date, day: string) => {
      const candidates = candidatesFor(restaurant, createdAt, 1, day);
      if (candidates.length === 0) return null;
      const first = pick(candidates);
      const sameStore = shuffle(candidatesFor(restaurant, createdAt, 1, day).filter((p) => p.store === first.store && p !== first));
      const products = [first, ...(chance(0.4) ? sameStore.slice(0, randomInt(1, 2)) : [])];
      return products.map((product) => {
        const available = product.quantity - product.held;
        const ordered = chance(0.35) ? available : Math.max(1, Math.round(available * between(0.25, 0.7)));
        return { product, ordered, quantity: ordered, status: "Pending" } as NewLine;
      });
    };

    // What the restaurant saw changed at sending, for some orders (a display snapshot).
    const sendChangesFor = (lines: NewLine[]) => {
      if (!chance(0.12)) return [];
      const line = lines[0]!;
      const product = line.product;
      return chance(0.5)
        ? [{
            product_id: product.id, name: product.name, unit: product.unit, kind: "PRICE_LOWERED",
            requested: line.ordered, sent: line.ordered, old_price: roundPrice(product.price * 1.2), new_price: product.price,
          }]
        : [{
            product_id: product.id, name: product.name, unit: product.unit, kind: "QUANTITY_REDUCED",
            requested: line.ordered + randomInt(1, 5), sent: line.ordered, old_price: product.price, new_price: product.price,
          }];
    };

    // One order from the history: decided, picked up or cancelled before today.
    const orderInHistory = async (restaurant: Business, day: string) => {
      const createdAt = at(day, between(9, 14));
      if (createdAt < restaurant.activeFrom) return;
      const lines = historyLines(restaurant, createdAt, day);
      if (!lines) return;
      const store = lines[0]!.product.store;
      const lastExpiry = lines.map((line) => line.product.expiry).sort()[0]!;

      const nextDay = addDays(day, 1);
      const canUseNextDay = nextDay <= yesterday && nextDay <= lastExpiry;
      let pickupAt = chance(0.6) ? pickupOn(store, day, createdAt) : null;
      if (!pickupAt && canUseNextDay) pickupAt = pickupOn(store, nextDay, createdAt);
      if (!pickupAt) pickupAt = pickupOn(store, day, createdAt) ?? addHours(createdAt, 1.5);
      const pickupNextDay = addDays(localDay(pickupAt), 1);

      const roll = random();
      const decidedAt = earlier(addHours(createdAt, between(0.3, 2.5)), addHours(pickupAt, -0.25));
      const decided = decidedAt > createdAt ? decidedAt : addHours(createdAt, 0.2);
      const acceptPartial = !chance(0.15);
      const base = { restaurant, lines, createdAt, pickupAt, acceptPartial, sendChanges: sendChangesFor(lines) };
      const storeEvent = (at: Date, to: string, extra: Partial<OrderEvent> = {}): OrderEvent => ({
        at, to, source: "STORE", actorId: store.id, ...extra,
      });
      const setAll = (status: string) => lines.forEach((line) => (line.status = status));

      if (roll < 0.04 && pickupNextDay <= yesterday) {
        // Accepted, never picked up: the store cancels it the next day.
        const missedAt = at(pickupNextDay, between(9, 11));
        setAll("Cancelled");
        const order = await insertOrder({
          ...base, status: "Cancelled", decidedAt: decided, updatedAt: missedAt,
          events: [storeEvent(decided, "Confirmed"), storeEvent(missedAt, "Cancelled")],
        });
        await notify(client, restaurant.id, "ORDER_ACCEPTED", `Your order #${order.code} was accepted.`, decided, { orderId: order.id });
        await notify(client, restaurant.id, "ORDER_PICKUP_MISSED", `Your order #${order.code} was cancelled because it was not picked up.`, missedAt, {
          orderId: order.id,
        });
        countStatus("Cancelled (missed pickup)");
      } else if (roll < 0.11) {
        const reason = pick(["NOT_ENOUGH_STOCK", "QUALITY", "OTHER"] as const);
        const note = reason === "OTHER" ? pick(OTHER_NOTES) : null;
        lines.forEach((line) => Object.assign(line, { status: "Rejected", reason, note }));
        const order = await insertOrder({
          ...base, status: "Rejected", decidedAt: decided, updatedAt: decided, events: [storeEvent(decided, "Rejected")],
        });
        await notify(client, restaurant.id, "ORDER_REJECTED", `Your order #${order.code} was rejected.`, decided, { orderId: order.id });
        countStatus("Rejected");
      } else if (roll < 0.21) {
        // The restaurant changes its mind: mostly the same day, sometimes the next morning.
        const cancelledAt = chance(0.2) && nextDay <= yesterday ? at(nextDay, between(8, 9.5)) : addHours(createdAt, between(0.2, 1.5));
        setAll("Cancelled");
        const order = await insertOrder({
          ...base, status: "Cancelled", updatedAt: cancelledAt,
          events: [{ at: cancelledAt, to: "Cancelled", source: "RESTAURANT", actorId: restaurant.id }],
        });
        await notify(client, store.id, "ORDER_CANCELLED", `Order #${order.code} was cancelled by the restaurant.`, cancelledAt, {
          orderId: order.id,
        });
        countStatus("Cancelled (by restaurant)");
      } else if (roll < 0.24 && lines.length === 1 && lastExpiry === day && nextDay <= today) {
        // Left pending until the product expired: the midnight job cancels it.
        const expiredAt = at(nextDay, 0.05);
        setAll("Cancelled");
        const order = await insertOrder({
          ...base, status: "Cancelled", updatedAt: expiredAt, events: [{ at: expiredAt, to: "Cancelled", source: "SYSTEM" }],
        });
        await notify(client, restaurant.id, "ORDER_EXPIRED", `Your order #${order.code} was cancelled because its products expired.`, expiredAt, {
          orderId: order.id,
        });
        countStatus("Cancelled (products expired)");
      } else if (roll > 0.985 && adminCancels < 2 && pickupAt > addHours(decided, 1.5)) {
        // Cancelled by an admin after a store reported a problem.
        adminCancels++;
        const admin = anyAdmin();
        const cancelledAt = addHours(decided, 1);
        const reason = "Prodavnica je prijavila da proizvod nije ispravan za prodaju.";
        setAll("Cancelled");
        const order = await insertOrder({
          ...base, status: "Cancelled", decidedAt: decided, updatedAt: cancelledAt,
          events: [
            storeEvent(decided, "Confirmed"),
            { at: cancelledAt, to: "Cancelled", source: "ADMIN", actorId: admin.id, reason },
          ],
        });
        await notify(client, restaurant.id, "ORDER_ACCEPTED", `Your order #${order.code} was accepted.`, decided, { orderId: order.id });
        await logAction(client, admin, "CANCEL_ORDER", cancelledAt, {
          orderId: order.id, reservationId: order.itemIds[0]!, productId: lines[0]!.product.id, userId: restaurant.id, reason,
        });
        for (const userId of [restaurant.id, store.id]) {
          await notify(client, userId, "ORDER_CANCELLED_BY_ADMIN", `Order #${order.code} was cancelled by the platform administrator.`, cancelledAt, {
            orderId: order.id,
            details: reason,
          });
        }
        countStatus("Cancelled (by admin)");
      } else {
        // Picked up; some orders were accepted only partly first (a smaller quantity with the
        // difference sold in the shop, a rejected item).
        const pickedUpAt = addHours(pickupAt, between(-0.25, 0.5));
        const partly = acceptPartial && roll < 0.36 && (lines.length > 1 || lines[0]!.ordered >= 2);
        const changed: { index: number; from: string; to: string }[] = [];
        const sales: { product: SimProduct; amount: number }[] = [];
        // Partly: the first line accepted with less (when there is more than 1 of it), the second
        // rejected; any other line accepted as it is. A one-line order always has 2 or more.
        lines.forEach((line, index) => {
          line.status = "Completed";
          if (partly && index === 0 && line.ordered >= 2) {
            line.quantity = Math.max(1, Math.round(line.ordered * between(0.5, 0.85)));
            line.reason = "NOT_ENOUGH_STOCK";
            if (chance(0.7)) sales.push({ product: line.product, amount: line.ordered - line.quantity });
          } else if (partly && index === 1) {
            line.status = "Rejected";
            line.reason = chance(0.5) ? "QUALITY" : "OTHER";
            line.note = line.reason === "OTHER" ? pick(OTHER_NOTES) : null;
          }
          changed.push({ index, from: "Pending", to: line.status === "Rejected" ? "Rejected" : "Confirmed" });
        });
        const order = await insertOrder({
          ...base, status: "Completed", decidedAt: decided, pickedUpAt, updatedAt: pickedUpAt,
          events: [storeEvent(decided, "Confirmed", { items: partly ? changed : [] }), storeEvent(pickedUpAt, "Completed")],
        });
        for (const line of lines) if (line.status === "Completed") line.product.held += line.quantity;
        cover(lines, decided);
        for (const sale of sales) await shopSaleFromOrder(sale.product, sale.amount, order.id, decided);
        await notify(
          client, restaurant.id, partly ? "ORDER_PARTIALLY_ACCEPTED" : "ORDER_ACCEPTED",
          `Your order #${order.code} was ${partly ? "partly accepted" : "accepted"}.`, decided, { orderId: order.id },
        );
        await notify(client, restaurant.id, "ORDER_COMPLETED", `Pickup of order #${order.code} confirmed.`, pickedUpAt, {
          orderId: order.id,
        });
        countStatus(partly ? "Completed (partly accepted)" : "Completed");
      }
    };

    const donate = async (donor: Business, createdAt: Date, expiry: string, status: "Available" | "Expired" | "Removed", updatedAt: Date) => {
      const sponsored = chance(0.4);
      let values: (string | number | string[] | Date | null)[];
      if (donor.store) {
        const template = pick(PRODUCT_TEMPLATES.filter((t) => donor.store!.categories.includes(t.category)));
        const originalPrice = roundPrice(between(...template.price));
        const [from, to] = donor.store.pickup;
        values = [
          template.name, template.description, template.category, randomInt(...template.quantity), template.unit, originalPrice,
          sponsored ? roundPrice(originalPrice * between(0.3, 0.5)) : null, `${from}:00`, `${to}:00`, [], null,
        ];
      } else {
        const meal = pick(MEAL_TEMPLATES);
        const originalPrice = roundPrice(between(...meal.price));
        values = [
          meal.name, meal.description, "Meals", randomInt(5, 20), "portion", originalPrice,
          sponsored ? roundPrice(originalPrice * 0.5) : null, "20:00", "22:00", meal.allergens, meal.temperature,
        ];
      }
      const result = await client.query<{ id: number }>(
        `INSERT INTO donation_offers
           (donor_id, donation_type, name, description, category, quantity, unit, original_price, donation_price,
            pickup_from, pickup_until, allergens, serving_temperature, expiry_date, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
        [donor.id, sponsored ? "SPONSORED" : "FREE", ...values, expiry, status, createdAt, updatedAt],
      );
      counts.donations++;
      return { id: result.rows[0]!.id, name: String(values[0]) };
    };

    // ----- History, day by day -----
    console.log(`Simulating ${HISTORY_DAYS} days of activity...`);
    const blocked = byEmail("restoran.tvrdjava@demo.com");
    const blockedFrom = addDays(startDay, 35);
    const blockedUntil = addDays(startDay, 37);
    let donorRemovals = 0;
    let adminDonationRemoval = false;

    for (let dayIndex = 0, day = startDay; day <= yesterday; dayIndex++, day = addDays(day, 1)) {
      // The platform grows: activity starts at ~55% and ends a little above the base rate.
      const growth = 0.55 + 0.6 * (dayIndex / HISTORY_DAYS);

      for (const store of stores) {
        const postings = chance(store.data.activity * growth) ? (chance(0.25) ? 2 : 1) : 0;
        for (let i = 0; i < postings; i++) {
          const postedAt = at(day, between(7, 11));
          if (postedAt < store.activeFrom) continue;
          const product = await publishProduct(store, postedAt, addDays(day, randomInt(2, 8)));
          if (!product) continue;
          if (chance(0.03)) {
            // Published by mistake and deleted within the hour: refunded the same day.
            product.frozen = true;
            product.removedAt = addHours(postedAt, between(0.2, 1));
            await refundForProduct(client, product.id, { actor: "USER", userId: store.id }, product.removedAt);
          } else if (adminProductRemovals < 2 && dayIndex > 10 && addDays(day, 1) <= yesterday && chance(0.02)) {
            adminProductRemovals++;
            product.frozen = true;
            product.removedAt = at(addDays(day, 1), between(9, 11));
            const admin = anyAdmin();
            const reason = "Opis i cijena proizvoda ne odgovaraju stvarnom stanju.";
            await refundForProduct(client, product.id, { actor: "ADMIN", userId: admin.id }, product.removedAt);
            await logAction(client, admin, "REMOVE_PRODUCT", product.removedAt, { productId: product.id, userId: store.id, reason });
            await notify(client, store.id, "PRODUCT_REMOVED_BY_ADMIN", `Your product was removed by the platform administrator: ${product.name}`, product.removedAt, {
              productId: product.id,
              details: reason,
            });
          }
        }
      }

      for (const restaurant of restaurants) {
        if (restaurant === blocked && day >= blockedFrom && day < blockedUntil) continue;
        if (!chance(restaurant.data.activity * growth)) continue;
        await orderInHistory(restaurant, day);
        if (chance(0.25)) await orderInHistory(restaurant, day);
      }

      for (const donor of businesses) {
        if (!chance(donor.store ? 0.07 : 0.05)) continue;
        const createdAt = at(day, between(10, 17));
        if (createdAt < donor.activeFrom) continue;
        const expiry = addDays(day, donor.store ? randomInt(1, 3) : randomInt(0, 1));
        if (expiry >= today) {
          await donate(donor, createdAt, expiry, "Available", createdAt);
        } else if (!adminDonationRemoval && dayIndex > 20) {
          adminDonationRemoval = true;
          const admin = anyAdmin();
          const removedAt = addHours(createdAt, between(2, 5));
          const reason = "Donacija nema navedene alergene.";
          const donation = await donate(donor, createdAt, expiry, "Removed", removedAt);
          await logAction(client, admin, "REMOVE_DONATION", removedAt, { donationId: donation.id, userId: donor.id, reason });
          await notify(client, donor.id, "DONATION_REMOVED_BY_ADMIN", `Your donation was removed by the platform administrator: ${donation.name}`, removedAt, {
            donationId: donation.id,
            details: reason,
          });
        } else if (donorRemovals < 3 && chance(0.1)) {
          donorRemovals++;
          await donate(donor, createdAt, expiry, "Removed", addHours(createdAt, between(1, 4)));
        } else {
          await donate(donor, createdAt, expiry, "Expired", at(addDays(expiry, 1), 0.05));
        }
      }
    }

    // ----- Today: current stock, open requests and upcoming pickups -----
    console.log("Creating current offer and open orders...");
    for (const store of stores) {
      for (let i = 0; i < store.store!.currentStock; i++) {
        let postedAt = at(addDays(today, -randomInt(0, 3)), between(7, 11));
        if (postedAt > addHours(now, -0.5)) postedAt = at(yesterday, between(7, 11));
        await publishProduct(store, postedAt, addDays(today, randomInt(1, 10)));
      }
    }

    // A recent time between 08:00 and 21:00, up to `hoursBack` ago.
    const recentTime = (hoursBack: number) => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const instant = addHours(now, -between(0.3, hoursBack));
        const hour = localHour(instant);
        if (hour >= 8 && hour <= 21) return instant;
      }
      return addHours(now, -0.3);
    };
    // A future pickup on one of the next `days` days (today first if the window is still open).
    const upcomingPickup = (store: Business, expiry: string, days: number) => {
      for (let offset = randomInt(0, days); offset <= days + 1; offset++) {
        const day = addDays(today, offset);
        if (day > expiry) break;
        const pickup = pickupOn(store, day, now);
        if (pickup) return pickup;
      }
      return null;
    };
    const weightedRestaurant = () => {
      const total = restaurants.reduce((sum, r) => sum + r.data.activity, 0);
      let roll = random() * total;
      for (const restaurant of restaurants) {
        roll -= restaurant.data.activity;
        if (roll < 0) return restaurant;
      }
      return restaurants[0]!;
    };

    // The lines of an open order: a product and, in about half the orders, 1 to 3 more of the same
    // store. Each line always leaves some stock, so the product stays on the marketplace.
    const openLines = (restaurant: Business, createdAt: Date, lastDay: string, status: NewLine["status"]) => {
      const candidates = candidatesFor(restaurant, createdAt, 2, lastDay);
      if (candidates.length === 0) return null;
      const first = pick(candidates);
      const sameStore = shuffle(candidates.filter((p) => p.store === first.store && p !== first));
      const products = [first, ...(chance(0.5) ? sameStore.slice(0, randomInt(1, 3)) : [])];
      return products.map((product): NewLine => {
        const available = product.quantity - product.held;
        const quantity = Math.max(1, Math.min(available - 1, Math.round(available * between(0.2, 0.5))));
        return { product, ordered: quantity, quantity, status };
      });
    };
    // The earliest expiry among the lines: the last possible pickup day.
    const earliestExpiry = (lines: NewLine[]) => lines.map((line) => line.product.expiry).sort()[0]!;

    // An open order: Pending (some with partial fulfilment off) or Confirmed, with 1 to 4 items.
    const openOrder = async (status: "Pending" | "Confirmed") => {
      const restaurant = weightedRestaurant();
      const createdAt = recentTime(status === "Pending" ? 36 : 72);
      const lines = openLines(restaurant, createdAt, today, status);
      if (!lines) return false;
      const product = lines[0]!.product;
      const pickupAt = upcomingPickup(product.store, earliestExpiry(lines), status === "Pending" ? 2 : 3);
      if (!pickupAt) return false;
      const acceptedAt = earlier(addHours(createdAt, between(0.3, 3)), addHours(now, -0.1));
      const order = await insertOrder({
        restaurant, lines, status, createdAt, pickupAt, acceptPartial: status === "Confirmed" || !chance(0.25),
        sendChanges: sendChangesFor(lines),
        decidedAt: status === "Confirmed" ? acceptedAt : null,
        updatedAt: status === "Confirmed" ? acceptedAt : createdAt,
        events: status === "Confirmed" ? [{ at: acceptedAt, to: "Confirmed", source: "STORE", actorId: product.store.id }] : [],
      });
      for (const line of lines) line.product.held += line.quantity;
      if (status === "Confirmed") {
        cover(lines, acceptedAt);
        await notify(client, restaurant.id, "ORDER_ACCEPTED", `Your order #${order.code} was accepted.`, acceptedAt, { orderId: order.id });
      }
      countStatus(status);
      return true;
    };
    for (const [status, target] of [["Pending", PENDING_NOW], ["Confirmed", CONFIRMED_NOW]] as const) {
      let created = 0;
      for (let attempt = 0; created < target && attempt < target * 10; attempt++) {
        if (await openOrder(status)) created++;
      }
    }

    // Late pickups: accepted orders whose pickup day was yesterday and three days ago, still
    // waiting for the store to mark them picked up or cancel them.
    for (const daysAgo of [1, 3]) {
      const pickupDay = addDays(today, -daysAgo);
      for (let attempt = 0; attempt < 30; attempt++) {
        const restaurant = weightedRestaurant();
        const createdAt = at(addDays(pickupDay, -1), between(10, 14));
        const lines = openLines(restaurant, createdAt, pickupDay, "Confirmed");
        if (!lines) continue;
        const product = lines[0]!.product;
        const pickupAt = pickupOn(product.store, pickupDay, createdAt);
        if (!pickupAt) continue;
        const acceptedAt = addHours(createdAt, between(0.5, 2));
        const order = await insertOrder({
          restaurant, lines, status: "Confirmed", createdAt, pickupAt, acceptPartial: true, decidedAt: acceptedAt,
          updatedAt: acceptedAt, events: [{ at: acceptedAt, to: "Confirmed", source: "STORE", actorId: product.store.id }],
        });
        for (const line of lines) line.product.held += line.quantity;
        cover(lines, acceptedAt);
        await notify(client, restaurant.id, "ORDER_ACCEPTED", `Your order #${order.code} was accepted.`, acceptedAt, { orderId: order.id });
        countStatus("Confirmed (late pickup)");
        break;
      }
    }
    // Current donations: product lines from stores, tonight's meals from restaurants.
    for (const donor of shuffle(stores).slice(0, 8)) {
      const createdAt = recentTime(40);
      await donate(donor, createdAt, addDays(today, randomInt(1, 3)), "Available", createdAt);
    }
    for (const donor of shuffle(restaurants).slice(0, 6)) {
      const createdAt = recentTime(20);
      await donate(donor, createdAt, localDay(createdAt) === today ? today : addDays(today, randomInt(0, 1)), "Available", createdAt);
    }

    // Requests still waiting for an admin.
    const neretva = byEmail("market.neretva@demo.com");
    await creditRequest({
      user: neretva, type: "SUBSCRIPTION", plan: "Pro", periodMonth: nextMonth(creditMonth(now)),
      createdAt: recentTime(30), status: "PENDING",
    });
    await creditRequest({
      user: byEmail("zeleni.market@demo.com"), type: "TOPUP", credits: 10, periodMonth: creditMonth(now),
      createdAt: addHours(now, -1.5), status: "PENDING",
    });
    // Branch top-ups: one waiting for its headquarters, one the headquarters forwarded to the admin.
    await creditRequest({
      user: byEmail("bingo.zenica@demo.com"), type: "TOPUP", credits: 20, periodMonth: creditMonth(now),
      createdAt: addHours(now, -3), status: "COMPANY_REVIEW", fromBranch: true,
    });
    await creditRequest({
      user: byEmail("bingo.tuzla@demo.com"), type: "TOPUP", credits: 10, periodMonth: creditMonth(now),
      createdAt: addHours(now, -5), status: "PENDING", fromBranch: true, companyApprovedAt: addHours(now, -4),
    });

    // ----- Sold in shop -----
    // Stores record part of some current offers as sold at their own till ("Sold in shop"), which
    // only lowers the free quantity; one product is sold out that way (no pending order on it).
    let shopSellOut = false;
    const shopCandidates = shuffle(
      products.filter((p) => !p.removedAt && !p.soldAt && !p.frozen && p.expiry >= today && p.quantity - p.held >= 4),
    );
    for (const product of shopCandidates.slice(0, 10)) {
      const free = product.quantity - product.held;
      const sellsOut = !shopSellOut && product.held === product.confirmed;
      const amount = sellsOut ? free : Math.max(1, Math.round(free * between(0.2, 0.4)));
      const soldAt = earlier(
        new Date(Math.max(product.postedAt.getTime() + HOUR_MS, recentTime(30).getTime())),
        addHours(now, -0.1),
      );
      await client.query(
        `INSERT INTO product_shop_sales (product_id, store_id, quantity, created_by, created_at)
         VALUES ($1, $2, $3, $2, $4)`,
        [product.id, product.store.id, amount, soldAt],
      );
      counts.shopSales++;
      product.held += amount;
      if (sellsOut) {
        shopSellOut = true;
        product.soldAt = soldAt;
        product.soldOutInShop = true;
      }
    }

    // ----- Final product statuses -----
    for (const product of products) {
      let status = "Available";
      let changedAt = product.postedAt;
      if (product.removedAt) {
        status = "Removed";
        changedAt = product.removedAt;
      } else if (product.soldAt) {
        status = "Sold";
        changedAt = product.soldAt;
        if (!product.soldOutInShop) await notify(client, product.store.id, "PRODUCT_SOLD_OUT", `${product.name} is sold out.`, product.soldAt, { productId: product.id });
      } else if (product.expiry < today) {
        status = "Expired";
        changedAt = at(addDays(product.expiry, 1), 0.05);
        await notify(client, product.store.id, "PRODUCT_EXPIRED", `${product.name} has expired and was removed from the marketplace.`, changedAt, {
          productId: product.id,
        });
      }
      if (status !== "Available") {
        await client.query("UPDATE products SET status = $1, updated_at = $2 WHERE id = $3", [status, changedAt, product.id]);
      }
    }

    // ----- Announcements and other admin work -----
    const announcementTimes = [
      { createdAt: at(addDays(startDay, 7), 10), expiresAt: at(addDays(startDay, 14), 23.5), endedAt: null, admin: mainAdmin },
      { createdAt: at(addDays(startDay, 30), 9), expiresAt: at(addDays(startDay, 33), 23.5), endedAt: at(addDays(startDay, 31), 12), admin: secondAdmin },
      { createdAt: at(addDays(today, -4), 11), expiresAt: at(addDays(today, 10), 23.5), endedAt: null, admin: mainAdmin },
    ];
    for (const [index, announcement] of ANNOUNCEMENTS.entries()) {
      const timing = announcementTimes[index]!;
      const result = await client.query<{ id: number }>(
        `INSERT INTO announcements (admin_id, audience, title_bs, body_bs, title_en, body_en, expires_at, ended_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          timing.admin.id, announcement.audience, announcement.title_bs, announcement.body_bs, announcement.title_en,
          announcement.body_en, timing.expiresAt, timing.endedAt, timing.createdAt,
        ],
      );
      const announcementId = result.rows[0]!.id;
      await logAction(client, timing.admin, "CREATE_ANNOUNCEMENT", timing.createdAt, { announcementId });
      if (timing.endedAt) await logAction(client, timing.admin, "END_ANNOUNCEMENT", timing.endedAt, { announcementId });
      const recipients = businesses.filter(
        (b) => (announcement.audience === "ALL" || b.role === announcement.audience) && b.createdAt < timing.createdAt,
      );
      for (const recipient of recipients) {
        await notify(client, recipient.id, "PLATFORM_ANNOUNCEMENT", `Platform announcement: ${announcement.title_en}`, timing.createdAt, {
          announcementId,
        });
        if (chance(0.4)) {
          await client.query(
            "INSERT INTO announcement_dismissals (announcement_id, user_id, dismissed_at) VALUES ($1, $2, $3)",
            [announcementId, recipient.id, addHours(timing.createdAt, between(0.5, 30))],
          );
        }
      }
    }

    const panorama = byEmail("restoran.panorama@demo.com");
    await logAction(client, secondAdmin, "RESET_PASSWORD", at(addDays(startDay, 15), 13.2), { userId: panorama.id });
    const vrelo = byEmail("mljekara.vrelo@demo.com");
    await logAction(client, mainAdmin, "UPDATE_PROFILE", at(addDays(startDay, 20), 10.4), { userId: vrelo.id });
    await logAction(client, mainAdmin, "BLOCK_USER", at(blockedFrom, 9.5), {
      userId: blocked.id,
      reason: "Više propuštenih preuzimanja bez obavještenja prodavnice.",
    });
    await logAction(client, mainAdmin, "UNBLOCK_USER", at(blockedUntil, 10), { userId: blocked.id });

    // ----- A cart -----
    // Restoran Ukus has three lines of the store with the most products on offer; the third one
    // was added at a lower price, so the cart shows "the price went up".
    console.log("Creating a cart...");
    const ukus = byEmail("restoran.ukus@demo.com");
    const cartProducts = await client.query<{ id: number; discounted_price: string; available: string }>(
      `WITH offer AS (
         SELECT products.id, products.store_id, products.discounted_price, ${availableQuantity("products")} AS available
         FROM products JOIN users AS stores ON stores.id = products.store_id
         WHERE ${sellableProduct("products", "stores")}
       ), best_store AS (
         SELECT offer.store_id FROM offer WHERE offer.available > 0
         GROUP BY offer.store_id ORDER BY COUNT(*) DESC, offer.store_id LIMIT 1
       )
       SELECT offer.id, offer.discounted_price, offer.available
       FROM offer JOIN best_store ON best_store.store_id = offer.store_id
       WHERE offer.available > 0
       ORDER BY offer.id LIMIT 3`,
    );
    for (const [index, product] of cartProducts.rows.entries()) {
      const price = parseFloat(product.discounted_price);
      const seenPrice = index === 2 ? Math.round(price * 85) / 100 : price;
      const quantity = Math.max(1, Math.min(Math.floor(parseFloat(product.available) / 2), 5));
      await client.query(
        `INSERT INTO cart_items (restaurant_id, product_id, quantity, unit_price_seen, added_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [ukus.id, product.id, Math.min(quantity, parseFloat(product.available)), seenPrice, recentTime(3)],
      );
    }

    await client.query("COMMIT");
    await printSummary(stores, restaurants, orderStatusCount);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error while seeding:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

async function printSummary(stores: Business[], restaurants: Business[], orderStatusCount: Record<string, number>) {
  const byStatus = async (sql: string) =>
    (await pool.query<{ label: string; count: string }>(sql)).rows.map((row) => `${row.label} ${row.count}`).join(", ");

  console.log(`\nDemo data covers ${startDay} to ${today}.`);
  console.log(`Users: ${stores.length} stores, ${restaurants.length} restaurants, ${ADMINS.length} admins.`);
  console.log(`Sold in shop: ${counts.shopSales} entries.`);
  console.log(`Products: ${counts.products} (${await byStatus("SELECT status AS label, COUNT(*) AS count FROM products GROUP BY status ORDER BY status")}).`);
  console.log(`Orders: ${counts.orders} with ${counts.items} items (${Object.entries(orderStatusCount).map(([label, count]) => `${label} ${count}`).join(", ")}).`);
  console.log(`Donations: ${counts.donations} (${await byStatus(
    "SELECT donation_type || ' ' || status AS label, COUNT(*) AS count FROM donation_offers GROUP BY donation_type, status ORDER BY 1",
  )}).`);
  console.log(`Subscriptions: ${await byStatus(
    "SELECT plans.name AS label, COUNT(*) AS count FROM subscriptions JOIN plans ON plans.id = subscriptions.plan_id GROUP BY plans.name ORDER BY plans.name",
  )}; top-ups approved: ${counts.topups}.`);
  console.log(`Credit requests: ${await byStatus("SELECT status AS label, COUNT(*) AS count FROM credit_requests GROUP BY status ORDER BY status")}.`);
  console.log(`Notifications: ${counts.notifications}.`);
  console.log("Products on offer now per store:");
  const perStore = await pool.query<{ business_name: string; available: string; total: string }>(
    `SELECT users.business_name,
            COUNT(products.id) FILTER (WHERE products.status = 'Available') AS available,
            COUNT(products.id) AS total
     FROM users LEFT JOIN products ON products.store_id = users.id
     WHERE users.role = 'STORE' GROUP BY users.id, users.business_name ORDER BY COUNT(products.id) DESC`,
  );
  for (const row of perStore.rows) console.log(`  - ${row.business_name}: ${row.available} on offer, ${row.total} in total`);

  console.log(`\nPassword for all accounts: ${SEED_PASSWORD}`);
  console.log(`Stores: ${stores.filter((s) => !s.store?.company).map((s) => s.data.email).join(", ")}`);
  console.log(`Restaurants: ${restaurants.map((r) => r.data.email).join(", ")}`);
  console.log(`Admins: ${ADMINS.map((a) => a.email).join(", ")}`);
  console.log(`Company headquarters: ${COMPANIES.map((c) => `${c.hq.email} (${c.name})`).join(", ")}`);
  console.log(`Branches: ${STORES.filter((s) => s.company).map((s) => `${s.email} (${s.company})`).join(", ")}`);
}

seed();
