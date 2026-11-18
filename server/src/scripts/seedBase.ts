// The accounts both local seeds start from (`npm run seed` stops here, `npm run seed:demo` adds
// the activity): the admins, Bingo d.o.o. with its headquarters and branches, and the stores and
// restaurants of seedData.ts, every profile complete (weekly hours, a pin, order settings, a logo
// where the business has its own brand), one password, and this month's plan for every store.
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import { UPLOADS_DIR, UPLOADS_URL_PREFIX } from "../services/storage.js";
import {
  cityLookup,
  grantMonthlyPlan,
  insertAdmin,
  insertBusiness,
  insertCompany,
  type Queryable,
} from "./seedAccounts.js";
import { ADMINS, COMPANIES, RESTAURANTS, SEED_PASSWORD, STORES, type SeedBusiness, type SeedStore } from "./seedData.js";
import { WEEKDAYS, type Schedule } from "../utils/schedule.js";

export interface SeedAccount {
  id: number;
  role: "STORE" | "RESTAURANT";
  data: SeedBusiness;
  store: SeedStore | null;
  createdAt: Date;
}

export interface BaseAccounts {
  admins: { id: number; email: string }[];
  // Company name → its id and headquarters login.
  companies: Map<string, { companyId: number; hqId: number }>;
  stores: SeedAccount[];
  restaurants: SeedAccount[];
}

// When each account was made and when a store's plan for this month was approved. The plain
// seed makes everything now; the demo seed passes times spread over its history.
export interface BaseTiming {
  admin: (index: number) => Date;
  company: (index: number) => Date;
  business: (role: "STORE" | "RESTAURANT", index: number) => Date;
  plan: (store: SeedAccount) => Date;
}

const NOW_TIMING: BaseTiming = {
  admin: () => new Date(),
  company: () => new Date(),
  business: () => new Date(),
  plan: () => new Date(),
};

// seedData.ts writes hours as "07:00–22:00": the same every day (none for an empty value).
export const weekly = (hours: string): Schedule | null => {
  const [open, close] = hours.split("–");
  if (!open || !close) return null;
  return Object.fromEntries(WEEKDAYS.map((day) => [day, { open, close }])) as Schedule;
};

// ----- Logos: a simple SVG with the business's initials, written to the local uploads -----

const LOGO_COLORS = ["#ea580c", "#16a34a", "#2563eb", "#9333ea", "#dc2626", "#0891b2", "#ca8a04", "#4f46e5"];
const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
const slug = (email: string) => email.replace(/@.*$/, "").replace(/[^a-z0-9]+/gi, "-");

const writeLogo = (key: string, name: string, colorIndex: number) => {
  const color = LOGO_COLORS[colorIndex % LOGO_COLORS.length]!;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<rect width="256" height="256" rx="48" fill="${color}"/>` +
    `<text x="128" y="128" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" ` +
    `font-size="104" font-weight="700" fill="#ffffff">${escapeXml(initials(name))}</text></svg>`;
  const fileName = `seed-${key}.svg`;
  fs.mkdirSync(path.join(UPLOADS_DIR, "logos"), { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, "logos", fileName), svg);
  return `${UPLOADS_URL_PREFIX}/logos/${fileName}`;
};

// Every independent store has its own logo, and every other restaurant; a branch shows its
// company's.
const hasOwnLogo = (role: "STORE" | "RESTAURANT", data: SeedBusiness, index: number) =>
  role === "STORE" ? !(data as SeedStore).company : index % 2 === 0;

// The plan a store has this month: the last one in its list of plans.
export const currentPlan = (store: SeedStore) => store.plans[store.plans.length - 1] as "Basic" | "Standard" | "Pro";

export const createBaseAccounts = async (db: Queryable, timing: BaseTiming = NOW_TIMING): Promise<BaseAccounts> => {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const admins: BaseAccounts["admins"] = [];
  for (const [index, admin] of ADMINS.entries()) {
    const id = await insertAdmin(db, {
      firstName: admin.first_name, lastName: admin.last_name, email: admin.email, passwordHash, createdAt: timing.admin(index),
    });
    admins.push({ id, email: admin.email });
  }

  const companies: BaseAccounts["companies"] = new Map();
  for (const [index, company] of COMPANIES.entries()) {
    const ids = await insertCompany(db, {
      name: company.name,
      description: company.description,
      hq: { firstName: company.hq.first_name, lastName: company.hq.last_name, email: company.hq.email, phone: company.hq.phone },
      passwordHash,
      createdAt: timing.company(index),
    });
    await db.query("UPDATE companies SET logo_url = $1 WHERE companies.id = $2", [
      writeLogo(`company-${index}`, company.name, index + 3),
      ids.companyId,
    ]);
    companies.set(company.name, ids);
  }

  const cityId = await cityLookup(db);
  const create = async (data: SeedBusiness, role: "STORE" | "RESTAURANT", index: number): Promise<SeedAccount> => {
    const store = role === "STORE" ? (data as SeedStore) : null;
    const company = store?.company === undefined ? null : companies.get(store.company);
    if (company === undefined) throw new Error(`Unknown seed company: ${store?.company}`);
    const createdAt = timing.business(role, index);
    const id = await insertBusiness(db, {
      role,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      businessName: data.business_name,
      cityId: cityId(data.city),
      address: data.address,
      phone: data.phone,
      passwordHash,
      openingSchedule: weekly(data.openingTimes),
      pickupSchedule: store ? weekly(data.pickupTimes) : null,
      description: data.description ?? null,
      companyId: company?.companyId ?? null,
      location: { latitude: data.location[0], longitude: data.location[1] },
      logoUrl: hasOwnLogo(role, data, index) ? writeLogo(slug(data.email), data.business_name, index) : null,
      deliveryEnabled: store?.deliveryEnabled ?? true,
      createdAt,
    });
    return { id, role, data, store, createdAt };
  };

  const stores: SeedAccount[] = [];
  for (const [index, store] of STORES.entries()) stores.push(await create(store, "STORE", index));
  const restaurants: SeedAccount[] = [];
  for (const [index, restaurant] of RESTAURANTS.entries()) restaurants.push(await create(restaurant, "RESTAURANT", index));

  // This month's plan for every store (restaurants pay no credits). A branch's request comes from
  // its headquarters.
  const approver = admins[0]!;
  for (const store of stores) {
    const company = store.store!.company === undefined ? undefined : companies.get(store.store!.company);
    await grantMonthlyPlan(db, {
      userId: store.id,
      planName: currentPlan(store.store!),
      autoRenew: store.store!.autoRenew,
      adminId: approver.id,
      at: timing.plan(store),
      ...(company ? { requestedBy: { userId: company.hqId, source: "COMPANY" as const } } : {}),
    });
  }

  return { admins, companies, stores, restaurants };
};

// The logins at the end of a seed run, one row per account.
export const printLogins = (accounts: BaseAccounts) => {
  const rows: [string, string, string][] = [
    ...ADMINS.map((admin): [string, string, string] => ["Admin", `${admin.first_name} ${admin.last_name}`, admin.email]),
    ...COMPANIES.map((company): [string, string, string] => ["Headquarters", company.name, company.hq.email]),
    ...accounts.stores.map((store): [string, string, string] => [
      store.store!.company ? "Branch" : "Store",
      `${store.data.business_name} (${store.data.city})`,
      store.data.email,
    ]),
    ...accounts.restaurants.map((r): [string, string, string] => ["Restaurant", `${r.data.business_name} (${r.data.city})`, r.data.email]),
  ];
  const widths = [0, 1, 2].map((column) => Math.max(...rows.map((row) => row[column]!.length), 5));
  const line = (row: string[]) => row.map((cell, column) => cell.padEnd(widths[column]!)).join("  ");
  console.log(`\n${line(["Role", "Account", "Email"])}`);
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(line(row));
  console.log(`\nPassword for every account: ${SEED_PASSWORD}`);
};
