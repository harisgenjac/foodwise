import type { Pool, PoolClient } from "pg";
import { HttpError } from "../utils/httpError.js";
import { creditDay, creditMonth, monthEnd } from "../utils/creditTime.js";

// All credit logic lives here; routes never touch credit_transactions directly.
//
// The ledger is append-only and the balance is always computed from it, never stored:
//   Total     = grants (plan, top-ups, admin adjustments) + refunds of charges from earlier months
//   Used      = charges − refunds of charges from the same month
//   Available = Total − Used
// A refund of an earlier month's charge counts as new credit in the current month, because the
// old month's credits have expired and cannot be given back where they came from.
//
// Every function that writes takes the caller's transaction client, so a charge or refund commits
// or rolls back together with the product or reservation change it belongs to. `now` is a
// parameter so tests can move the clock across day, month and DST boundaries.

type Db = Pool | PoolClient;

export type CreditActor = "USER" | "ADMIN" | "SYSTEM";

// Who caused a refund or grant: a user's own action, an admin, or the system (jobs).
export interface ActorRef {
  actor: CreditActor;
  userId: number | null;
}

const SYSTEM: ActorRef = { actor: "SYSTEM", userId: null };

// Client paths the 402 points to (My profile sections).
export const SUBSCRIPTION_ACTION_URL = "/my-profile#subscription";
export const TOPUP_ACTION_URL = "/my-profile#topup";

// HTTP 402 with { error, code, hasActiveSubscription, actionUrl }. `error` instead of the spec's
// `message`, so it follows the API rule and the client's existing error handling shows it.
export class InsufficientCreditsError extends HttpError {
  constructor(hasActiveSubscription: boolean) {
    super(402, "Not enough credits.", {
      code: "INSUFFICIENT_CREDITS",
      hasActiveSubscription,
      actionUrl: hasActiveSubscription ? TOPUP_ACTION_URL : SUBSCRIPTION_ACTION_URL,
    });
  }
}

export interface ActiveSubscription {
  id: number;
  plan_id: number;
  plan_name: string;
  credits_per_period: number;
  period_month: string;
  auto_renew: boolean;
}

export interface CreditBalance {
  periodStart: string;
  periodEnd: string;
  subscription: ActiveSubscription | null;
  hasActiveSubscription: boolean;
  total: number;
  used: number;
  available: number;
}

export interface CreditTransaction {
  id: number;
  user_id: number;
  subscription_id: number | null;
  period_month: string;
  amount: number;
  type: string;
  category: string | null;
  refunds_transaction_id: number | null;
  created_at: Date;
}

export const findActiveSubscription = async (
  db: Db,
  userId: number,
  periodMonth: string,
): Promise<ActiveSubscription | null> => {
  const result = await db.query<ActiveSubscription>(
    `SELECT subscriptions.id, subscriptions.plan_id, plans.name AS plan_name,
            plans.credits_per_period, subscriptions.period_month, subscriptions.auto_renew
     FROM subscriptions
     JOIN plans ON plans.id = subscriptions.plan_id
     WHERE subscriptions.user_id = $1 AND subscriptions.period_month = $2
       AND subscriptions.status = 'ACTIVE'`,
    [userId, periodMonth],
  );
  return result.rows[0] ?? null;
};

// Locks the user's subscription row for the month. Every charge goes through this lock, so two
// parallel requests for the same user run one after the other and cannot both spend the last
// credit. Callers lock their product/reservation first and this second, always in that order,
// so the locks cannot deadlock.
const lockActiveSubscription = async (client: PoolClient, userId: number, periodMonth: string) => {
  const result = await client.query<{ id: number }>(
    `SELECT id FROM subscriptions
     WHERE user_id = $1 AND period_month = $2 AND status = 'ACTIVE'
     FOR UPDATE`,
    [userId, periodMonth],
  );
  return result.rows[0]?.id ?? null;
};

// Total and used over ledger rows (`entry`) grouped by the caller. A refund row joins its charge
// to tell a same-month refund (less used) from an earlier month's (new credit). SUM is bigint,
// so the results are cast back to integer.
const TOTALS_COLUMNS = `
  (COALESCE(SUM(entry.amount) FILTER (
     WHERE entry.type IN ('PLAN_GRANT', 'TOPUP_GRANT', 'ADMIN_ADJUSTMENT')), 0)
   + COALESCE(SUM(entry.amount) FILTER (
     WHERE entry.refunds_transaction_id IS NOT NULL AND charge.period_month <> entry.period_month), 0)
  )::int AS total,
  (COALESCE(-SUM(entry.amount) FILTER (
     WHERE entry.type IN ('PRODUCT_CHARGE', 'RESERVATION_CHARGE')), 0)
   - COALESCE(SUM(entry.amount) FILTER (
     WHERE entry.refunds_transaction_id IS NOT NULL AND charge.period_month = entry.period_month), 0)
  )::int AS used`;
const TOTALS_FROM = `
  FROM credit_transactions entry
  LEFT JOIN credit_transactions charge ON charge.id = entry.refunds_transaction_id`;

const periodTotals = async (db: Db, userId: number, periodMonth: string) => {
  const result = await db.query<{ total: number; used: number }>(
    `SELECT ${TOTALS_COLUMNS} ${TOTALS_FROM}
     WHERE entry.user_id = $1 AND entry.period_month = $2`,
    [userId, periodMonth],
  );
  const row = result.rows[0]!;
  return { total: row.total, used: row.used };
};

// The balance of the current credit month. Credits recorded for a month without an active
// subscription (a refund or an admin adjustment) show in the totals, but only count as
// available once the user subscribes for that month.
export const getBalance = async (db: Db, userId: number, now = new Date()): Promise<CreditBalance> => {
  const periodMonth = creditMonth(now);
  // Sequential: `db` may be a transaction client, which runs one query at a time.
  const subscription = await findActiveSubscription(db, userId, periodMonth);
  const { total, used } = await periodTotals(db, userId, periodMonth);
  return {
    periodStart: periodMonth,
    periodEnd: monthEnd(periodMonth),
    subscription,
    hasActiveSubscription: subscription !== null,
    total,
    used,
    available: subscription ? Math.max(total - used, 0) : 0,
  };
};

export interface UserCreditSummary {
  userId: number;
  planName: string | null;
  hasActiveSubscription: boolean;
  total: number;
  used: number;
  available: number;
}

// The current month's balance of many users in two queries (the admin overview page).
export const getBalances = async (db: Db, userIds: number[], now = new Date()): Promise<Map<number, UserCreditSummary>> => {
  const periodMonth = creditMonth(now);
  const totals = await db.query<{ user_id: number; total: number; used: number }>(
    `SELECT entry.user_id, ${TOTALS_COLUMNS} ${TOTALS_FROM}
     WHERE entry.user_id = ANY($1) AND entry.period_month = $2
     GROUP BY entry.user_id`,
    [userIds, periodMonth],
  );
  const subscriptions = await db.query<{ user_id: number; plan_name: string }>(
    `SELECT subscriptions.user_id, plans.name AS plan_name
     FROM subscriptions
     JOIN plans ON plans.id = subscriptions.plan_id
     WHERE subscriptions.user_id = ANY($1) AND subscriptions.period_month = $2
       AND subscriptions.status = 'ACTIVE'`,
    [userIds, periodMonth],
  );
  const summaries = new Map<number, UserCreditSummary>();
  for (const userId of userIds) {
    const row = totals.rows.find((totalsRow) => totalsRow.user_id === userId);
    const subscription = subscriptions.rows.find((subscriptionRow) => subscriptionRow.user_id === userId);
    const total = row?.total ?? 0;
    const used = row?.used ?? 0;
    summaries.set(userId, {
      userId,
      planName: subscription?.plan_name ?? null,
      hasActiveSubscription: subscription !== undefined,
      total,
      used,
      available: subscription ? Math.max(total - used, 0) : 0,
    });
  }
  return summaries;
};

// Credits used by all stores and restaurants in the current month (the admin overview), with
// the same rules as a single balance: same-month refunds are not used.
export const getPlatformUsage = async (db: Db, now = new Date()): Promise<number> => {
  const result = await db.query<{ used: number }>(
    `SELECT ${TOTALS_COLUMNS} ${TOTALS_FROM} WHERE entry.period_month = $1`,
    [creditMonth(now)],
  );
  return result.rows[0]?.used ?? 0;
};

export interface MonthUsage {
  month: string;
  hasSubscription: boolean;
  total: number;
  used: number;
}

// The Credits page: used and total credits for each month of a year, and the credits used per
// product category in that year. A charge refunded in its own month never counts; one refunded
// after a month change stays used in its month (the refund was new credit in the next month),
// so the categories add up to the months.
export const getUsageHistory = async (db: Db, userId: number, year: number) => {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const totals = await db.query<{ period_month: string; total: number; used: number }>(
    `SELECT entry.period_month, ${TOTALS_COLUMNS} ${TOTALS_FROM}
     WHERE entry.user_id = $1 AND entry.period_month >= $2 AND entry.period_month < $3
     GROUP BY entry.period_month`,
    [userId, from, to],
  );
  const subscribed = await db.query<{ period_month: string }>(
    `SELECT period_month FROM subscriptions
     WHERE user_id = $1 AND status = 'ACTIVE' AND period_month >= $2 AND period_month < $3`,
    [userId, from, to],
  );
  const categories = await db.query<{ category: string | null; used: number }>(
    `SELECT charge.category, COUNT(*)::int AS used
     FROM credit_transactions charge
     WHERE charge.user_id = $1 AND charge.type IN ('PRODUCT_CHARGE', 'RESERVATION_CHARGE')
       AND charge.period_month >= $2 AND charge.period_month < $3
       AND NOT EXISTS (
         SELECT 1 FROM credit_transactions refund
         WHERE refund.refunds_transaction_id = charge.id AND refund.period_month = charge.period_month
       )
     GROUP BY charge.category
     ORDER BY used DESC, charge.category`,
    [userId, from, to],
  );

  const months: MonthUsage[] = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    const row = totals.rows.find((totalsRow) => totalsRow.period_month === month);
    return {
      month,
      hasSubscription: subscribed.rows.some((subscription) => subscription.period_month === month),
      total: row?.total ?? 0,
      used: row?.used ?? 0,
    };
  });
  return { year, months, categories: categories.rows };
};

// One user's ledger, newest first (the admin's per-user view).
export const listTransactions = async (db: Db, userId: number, page: { limit: number; offset: number }) => {
  const total = await db.query<{ total: string }>(
    "SELECT COUNT(*) AS total FROM credit_transactions WHERE user_id = $1",
    [userId],
  );
  const result = await db.query(
    `SELECT entry.id, entry.period_month, entry.amount, entry.type, entry.reason, entry.category,
            entry.related_entity_type, entry.related_entity_id, entry.refunds_transaction_id,
            entry.actor, entry.created_at, creators.email AS created_by_email
     FROM credit_transactions entry
     LEFT JOIN users AS creators ON creators.id = entry.created_by_user_id
     WHERE entry.user_id = $1
     ORDER BY entry.created_at DESC, entry.id DESC
     LIMIT $2 OFFSET $3`,
    [userId, page.limit, page.offset],
  );
  return { transactions: result.rows, total: parseInt(total.rows[0]!.total, 10) };
};

// Same-day refund rule: a refund is possible only on the credit day (Europe/London) of the charge.
export const isRefundEligible = (chargeCreatedAt: Date, now = new Date()): boolean =>
  creditDay(chargeCreatedAt) === creditDay(now);

interface ChargeItem {
  id: number;
  category: string | null;
}

// Checks the balance and writes one charge row per item, all under the subscription lock.
// Credits only ever come from the current month, so a past month's leftover cannot be spent.
const charge = async (
  client: PoolClient,
  userId: number,
  type: "PRODUCT_CHARGE" | "RESERVATION_CHARGE",
  entityType: "product" | "reservation",
  items: ChargeItem[],
  now: Date,
): Promise<CreditTransaction[]> => {
  const periodMonth = creditMonth(now);
  const subscriptionId = await lockActiveSubscription(client, userId, periodMonth);
  if (subscriptionId === null) {
    throw new InsufficientCreditsError(false);
  }
  const { total, used } = await periodTotals(client, userId, periodMonth);
  if (total - used < items.length) {
    throw new InsufficientCreditsError(true);
  }

  const values: (string | number | Date | null)[] = [userId, subscriptionId, periodMonth, type, entityType, now];
  const rows = items.map((item) => {
    values.push(item.id, item.category);
    return `($1, $2, $3, -1, $4, $5, $${values.length - 1}, $${values.length}, 'USER', $1, $6)`;
  });
  const result = await client.query<CreditTransaction>(
    `INSERT INTO credit_transactions
       (user_id, subscription_id, period_month, amount, type, related_entity_type, related_entity_id,
        category, actor, created_by_user_id, created_at)
     VALUES ${rows.join(", ")}
     RETURNING *`,
    values,
  );
  return result.rows;
};

// 1 credit per published (non-donation) product. Throws InsufficientCreditsError (402).
export const chargeForProduct = async (
  client: PoolClient,
  storeId: number,
  product: ChargeItem,
  now = new Date(),
) => (await charge(client, storeId, "PRODUCT_CHARGE", "product", [product], now))[0]!;

// CSV import: all products are charged together or none (the import is all or nothing too).
export const chargeForProducts = (client: PoolClient, storeId: number, products: ChargeItem[], now = new Date()) =>
  charge(client, storeId, "PRODUCT_CHARGE", "product", products, now);

// 1 credit per reservation; `category` is the reserved product's category.
export const chargeForReservation = async (
  client: PoolClient,
  restaurantId: number,
  reservation: ChargeItem,
  now = new Date(),
) => (await charge(client, restaurantId, "RESERVATION_CHARGE", "reservation", [reservation], now))[0]!;

export type RefundResult =
  | { refunded: true; transaction: CreditTransaction }
  | { refunded: false; reason: "NO_CHARGE" | "DAY_PASSED" | "HAS_RESERVATIONS" | "ALREADY_REFUNDED" };

// The newest charge of an entity that has not been refunded yet. A product can be charged more
// than once (published, moved to donations and refunded, returned to the offer).
const findOpenCharge = async (
  client: PoolClient,
  type: "PRODUCT_CHARGE" | "RESERVATION_CHARGE",
  entityType: "product" | "reservation",
  entityId: number,
) => {
  const result = await client.query<CreditTransaction>(
    `SELECT * FROM credit_transactions charge
     WHERE charge.type = $1 AND charge.related_entity_type = $2 AND charge.related_entity_id = $3
       AND NOT EXISTS (
         SELECT 1 FROM credit_transactions refund WHERE refund.refunds_transaction_id = charge.id
       )
     ORDER BY charge.created_at DESC, charge.id DESC
     LIMIT 1`,
    [type, entityType, entityId],
  );
  return result.rows[0] ?? null;
};

const refund = async (
  client: PoolClient,
  original: CreditTransaction,
  type: "PRODUCT_REFUND" | "RESERVATION_REFUND",
  by: ActorRef,
  now: Date,
): Promise<RefundResult> => {
  // The refund always lands in the current month: for a same-day refund that is the charge's
  // month; for a forced refund after a month change it is the new month. Without an active
  // subscription there the row has no subscription_id and only counts if the user subscribes.
  const periodMonth = creditMonth(now);
  const subscription = await findActiveSubscription(client, original.user_id, periodMonth);
  // The UNIQUE refunds_transaction_id makes a second refund of the same charge impossible even
  // if two requests got here at once; the loser simply refunds nothing.
  const result = await client.query<CreditTransaction>(
    `INSERT INTO credit_transactions
       (user_id, subscription_id, period_month, amount, type, related_entity_type, related_entity_id,
        category, refunds_transaction_id, actor, created_by_user_id, created_at)
     SELECT user_id, $2, $3, -amount, $4, related_entity_type, related_entity_id,
            category, id, $5, $6, $7
     FROM credit_transactions WHERE id = $1
     ON CONFLICT (refunds_transaction_id) DO NOTHING
     RETURNING *`,
    [original.id, subscription?.id ?? null, periodMonth, type, by.actor, by.userId, now],
  );
  const transaction = result.rows[0];
  return transaction ? { refunded: true, transaction } : { refunded: false, reason: "ALREADY_REFUNDED" };
};

// A store's product leaves the offer (deleted, or moved to donations completely). Refunded only
// on the day of the charge and only if nothing was reserved: once a restaurant has a pending,
// accepted or picked-up reservation, the listing has done its job and the credit stays spent.
// Rejected and cancelled reservations do not count, because nothing was sold. The caller holds
// the product row lock, so no reservation can be created while this decides.
export const refundForProduct = async (
  client: PoolClient,
  productId: number,
  by: ActorRef,
  now = new Date(),
): Promise<RefundResult> => {
  const original = await findOpenCharge(client, "PRODUCT_CHARGE", "product", productId);
  if (!original) return { refunded: false, reason: "NO_CHARGE" };
  if (!isRefundEligible(original.created_at, now)) return { refunded: false, reason: "DAY_PASSED" };

  const reservations = await client.query(
    `SELECT 1 FROM reservations
     WHERE product_id = $1 AND status IN ('Pending', 'Confirmed', 'Completed')
     LIMIT 1`,
    [productId],
  );
  if (reservations.rows.length > 0) return { refunded: false, reason: "HAS_RESERVATIONS" };

  return refund(client, original, "PRODUCT_REFUND", by, now);
};

// A reservation ends without a sale. `forced` refunds regardless of the day: the store rejected
// it, or the system/an admin cancelled it, so the restaurant is not at fault. The restaurant's
// own cancel is not forced and follows the same-day rule.
export const refundForReservation = async (
  client: PoolClient,
  reservationId: number,
  { forced, by = SYSTEM }: { forced: boolean; by?: ActorRef },
  now = new Date(),
): Promise<RefundResult> => {
  const original = await findOpenCharge(client, "RESERVATION_CHARGE", "reservation", reservationId);
  if (!original) return { refunded: false, reason: "NO_CHARGE" };
  if (!forced && !isRefundEligible(original.created_at, now)) {
    return { refunded: false, reason: "DAY_PASSED" };
  }
  return refund(client, original, "RESERVATION_REFUND", by, now);
};

// Admin approves a subscription request: creates the subscription for its month (the current or
// the next one) and grants the plan's credits to that month.
export const grantPlan = async (
  client: PoolClient,
  {
    userId,
    planId,
    periodMonth,
    autoRenew,
    requestId = null,
    by,
  }: {
    userId: number;
    planId: number;
    periodMonth: string;
    autoRenew: boolean;
    requestId?: number | null;
    by: ActorRef;
  },
  now = new Date(),
) => {
  if (periodMonth < creditMonth(now)) {
    throw new HttpError(400, "This month has already ended.");
  }
  const plan = await client.query<{ credits_per_period: number }>(
    "SELECT credits_per_period FROM plans WHERE id = $1",
    [planId],
  );
  if (!plan.rows[0]) {
    throw new HttpError(404, "Plan not found.");
  }

  const subscription = await client.query<{ id: number }>(
    `INSERT INTO subscriptions (user_id, plan_id, credit_request_id, period_month, auto_renew)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, period_month) DO NOTHING
     RETURNING *`,
    [userId, planId, requestId, periodMonth, autoRenew],
  );
  if (!subscription.rows[0]) {
    throw new HttpError(400, "The user already has a subscription for this month.");
  }

  const grant = await client.query<CreditTransaction>(
    `INSERT INTO credit_transactions
       (user_id, subscription_id, period_month, amount, type, related_entity_type, related_entity_id,
        actor, created_by_user_id, created_at)
     VALUES ($1, $2, $3, $4, 'PLAN_GRANT', $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      subscription.rows[0].id,
      periodMonth,
      plan.rows[0].credits_per_period,
      requestId === null ? null : "credit_request",
      requestId,
      by.actor,
      by.userId,
      now,
    ],
  );
  return { subscription: subscription.rows[0], transaction: grant.rows[0]! };
};

// Admin approves a top-up: the credits go into the current month, which needs an active
// subscription (top-ups extend a plan, they do not replace one).
export const grantTopup = async (
  client: PoolClient,
  { userId, packageId, requestId = null, by }: { userId: number; packageId: number; requestId?: number | null; by: ActorRef },
  now = new Date(),
) => {
  const periodMonth = creditMonth(now);
  const subscriptionId = await lockActiveSubscription(client, userId, periodMonth);
  if (subscriptionId === null) {
    throw new HttpError(400, "An active subscription for the current month is required.");
  }
  const topupPackage = await client.query<{ credits: number }>(
    "SELECT credits FROM topup_packages WHERE id = $1",
    [packageId],
  );
  if (!topupPackage.rows[0]) {
    throw new HttpError(404, "Top-up package not found.");
  }
  const result = await client.query<CreditTransaction>(
    `INSERT INTO credit_transactions
       (user_id, subscription_id, period_month, amount, type, related_entity_type, related_entity_id,
        actor, created_by_user_id, created_at)
     VALUES ($1, $2, $3, $4, 'TOPUP_GRANT', $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      subscriptionId,
      periodMonth,
      topupPackage.rows[0].credits,
      requestId === null ? null : "credit_request",
      requestId,
      by.actor,
      by.userId,
      now,
    ],
  );
  return result.rows[0]!;
};

// Manual +/− correction by an admin, always into the current month. A deduction may not take
// the available balance below zero.
export const adjustCredits = async (
  client: PoolClient,
  { userId, amount, reason, by }: { userId: number; amount: number; reason: string; by: ActorRef },
  now = new Date(),
) => {
  if (!Number.isInteger(amount) || amount === 0) {
    throw new HttpError(400, "Amount must be a whole number other than zero.");
  }
  if (!reason.trim()) {
    throw new HttpError(400, "A reason is required (at most 500 characters).");
  }
  const periodMonth = creditMonth(now);
  const subscriptionId = await lockActiveSubscription(client, userId, periodMonth);
  if (amount < 0) {
    const { total, used } = await periodTotals(client, userId, periodMonth);
    if (total - used + amount < 0) {
      throw new HttpError(400, "The balance cannot go below zero.");
    }
  }
  const result = await client.query<CreditTransaction>(
    `INSERT INTO credit_transactions
       (user_id, subscription_id, period_month, amount, type, reason, actor, created_by_user_id, created_at)
     VALUES ($1, $2, $3, $4, 'ADMIN_ADJUSTMENT', $5, $6, $7, $8)
     RETURNING *`,
    [userId, subscriptionId, periodMonth, amount, reason.trim(), by.actor, by.userId, now],
  );
  return result.rows[0]!;
};
