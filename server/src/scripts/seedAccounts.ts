// Accounts for the seeds. The local seeds (seed.ts, seedDemo.ts) and the e2e seed
// (e2e/support/seed.ts) all write their accounts through these, so the three cannot drift apart.
// Every function takes anything with `query` (a pg Client or PoolClient): the e2e package has
// its own copy of pg, so pg's classes are not part of the signatures.
import type { PoolClient } from "pg";
import { adjustCredits, grantPlan, type ActorRef } from "../services/creditService.js";
import { creditMonth } from "../utils/creditTime.js";
import { WEEKDAYS, type Schedule } from "../utils/schedule.js";

export interface Queryable {
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

// Tables that keep their rows: node-pg-migrate's own and the reference data the baseline
// migration fills (cities, plans, top-up packages).
export const KEPT_TABLES = ["pgmigrations", "cities", "plans", "topup_packages"];

// Empties every other table and restarts the ids. TRUNCATE fires no row triggers, so the
// append-only credit ledger empties too.
export const wipeData = async (db: Queryable) => {
  const tables = await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL($1)",
    [KEPT_TABLES],
  );
  if (tables.rows.length === 0) return;
  await db.query(`TRUNCATE ${tables.rows.map((row) => `"${row.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
};

// The same hours every day of the week (utils/schedule.ts).
export const everyDay = (open: string, close: string): Schedule =>
  Object.fromEntries(WEEKDAYS.map((day) => [day, { open, close }])) as Schedule;

// Looks cities up by name; throws for a name the baseline does not have.
export const cityLookup = async (db: Queryable) => {
  const rows = await db.query<{ id: number; name: string }>("SELECT cities.id, cities.name FROM cities");
  const ids = new Map(rows.rows.map((row) => [row.name, row.id]));
  return (name: string) => {
    const id = ids.get(name);
    if (id === undefined) throw new Error(`City ${name} is missing; run the migrations first.`);
    return id;
  };
};

export interface AdminInput {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  createdAt?: Date;
}

export const insertAdmin = async (db: Queryable, input: AdminInput) => {
  const result = await db.query<{ id: number }>(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, created_at)
     VALUES ($1, $2, $3, $4, 'ADMIN', $5) RETURNING id`,
    [input.firstName, input.lastName, input.email, input.passwordHash, input.createdAt ?? new Date()],
  );
  return result.rows[0]!.id;
};

export interface CompanyInput {
  name: string;
  description?: string | null;
  hq: { firstName: string; lastName: string; email: string; phone: string };
  passwordHash: string;
  createdAt?: Date;
}

// A company (store chain) with its headquarters login, profile complete.
export const insertCompany = async (db: Queryable, input: CompanyInput) => {
  const createdAt = input.createdAt ?? new Date();
  const company = await db.query<{ id: number }>(
    "INSERT INTO companies (name, description, created_at, updated_at) VALUES ($1, $2, $3, $3) RETURNING id",
    [input.name, input.description ?? null, createdAt],
  );
  const companyId = company.rows[0]!.id;
  const hq = await db.query<{ id: number }>(
    `INSERT INTO users (first_name, last_name, phone, email, password_hash, role, company_id, created_at)
     VALUES ($1, $2, $3, $4, $5, 'COMPANY', $6, $7) RETURNING id`,
    [input.hq.firstName, input.hq.lastName, input.hq.phone, input.hq.email, input.passwordHash, companyId, createdAt],
  );
  return { companyId, hqId: hq.rows[0]!.id };
};

export interface BusinessInput {
  role: "STORE" | "RESTAURANT";
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  cityId: number;
  address: string;
  phone: string;
  passwordHash: string;
  openingSchedule: Schedule | null;
  // A store's only; ignored for a restaurant.
  pickupSchedule?: Schedule | null;
  description?: string | null;
  // A branch of this company.
  companyId?: number | null;
  location?: { latitude: number; longitude: number } | null;
  logoUrl?: string | null;
  // Store order settings (defaults as in the schema: delivery on, 30 minutes).
  deliveryEnabled?: boolean;
  preparationMinutes?: number;
  createdAt?: Date;
}

// A store or restaurant with a complete profile (no setup gate) and no temporary password.
export const insertBusiness = async (db: Queryable, input: BusinessInput) => {
  const isStore = input.role === "STORE";
  const result = await db.query<{ id: number }>(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, business_name, city_id, address, phone,
                        opening_schedule, pickup_schedule, description, company_id, latitude, longitude, logo_url,
                        delivery_enabled, preparation_minutes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
    [
      input.firstName, input.lastName, input.email, input.passwordHash, input.role, input.businessName, input.cityId,
      input.address, input.phone,
      input.openingSchedule ? JSON.stringify(input.openingSchedule) : null,
      isStore && input.pickupSchedule ? JSON.stringify(input.pickupSchedule) : null,
      input.description ?? null, input.companyId ?? null,
      input.location?.latitude ?? null, input.location?.longitude ?? null, input.logoUrl ?? null,
      input.deliveryEnabled ?? true, input.preparationMinutes ?? 30, input.createdAt ?? new Date(),
    ],
  );
  return result.rows[0]!.id;
};

export interface MonthlyPlanInput {
  userId: number;
  planName: "Basic" | "Standard" | "Pro";
  autoRenew: boolean;
  // The admin who approves the request.
  adminId: number;
  // The request's time (asked and approved then); the plan is for this time's credit month.
  at?: Date;
  // Who asked: the store itself (USER) or, for a branch, its headquarters (COMPANY).
  requestedBy?: { userId: number; source: "USER" | "COMPANY" };
}

// The plan for the credit month of `at`, the way the app grants it: an approved subscription
// request (its trigger snapshots the plan's credits and price) and creditService.grantPlan, which
// creates the subscription and the PLAN_GRANT.
export const grantMonthlyPlan = async (db: Queryable, input: MonthlyPlanInput) => {
  const at = input.at ?? new Date();
  const requestedBy = input.requestedBy ?? { userId: input.userId, source: "USER" as const };
  const plan = await db.query<{ id: number }>("SELECT plans.id FROM plans WHERE plans.name = $1", [input.planName]);
  if (!plan.rows[0]) throw new Error(`Plan ${input.planName} is missing; run the migrations first.`);
  const request = await db.query<{ id: number; credits: number }>(
    `INSERT INTO credit_requests
       (user_id, request_type, plan_id, period_month, auto_renew, status, source, requested_by, reviewed_by,
        reviewed_at, created_at)
     VALUES ($1, 'SUBSCRIPTION', $2, $3, $4, 'APPROVED', $5, $6, $7, $8, $8)
     RETURNING id, credits`,
    [
      input.userId, plan.rows[0].id, creditMonth(at), input.autoRenew, requestedBy.source, requestedBy.userId,
      input.adminId, at,
    ],
  );
  const by: ActorRef = { actor: "ADMIN", userId: input.adminId };
  // grantPlan only runs queries; a Client of either copy of pg does.
  const granted = await grantPlan(
    db as unknown as PoolClient,
    {
      userId: input.userId,
      planId: plan.rows[0].id,
      periodMonth: creditMonth(at),
      autoRenew: input.autoRenew,
      credits: request.rows[0]!.credits,
      requestId: request.rows[0]!.id,
      by,
    },
    at,
  );
  await db.query("UPDATE subscriptions SET created_at = $1 WHERE subscriptions.id = $2", [at, granted.subscription.id]);
  return { requestId: request.rows[0]!.id, subscriptionId: granted.subscription.id as number };
};

// Extra credits for this month (an admin's adjustment, as creditService.adjustCredits writes it);
// the store needs this month's plan first.
export const addCredits = async (
  db: Queryable,
  input: { userId: number; amount: number; reason: string; adminId: number; at?: Date },
) => {
  await adjustCredits(
    db as unknown as PoolClient,
    { userId: input.userId, amount: input.amount, reason: input.reason, by: { actor: "ADMIN", userId: input.adminId } },
    input.at ?? new Date(),
  );
};
