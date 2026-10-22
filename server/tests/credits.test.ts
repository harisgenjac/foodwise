import type { PoolClient } from "pg";
import pool from "../src/config/db.js";
import {
  InsufficientCreditsError,
  adjustCredits,
  chargeForProduct,
  chargeForProducts,
  chargeForReservation,
  getBalance,
  grantPlan,
  grantTopup,
  refundForProduct,
  refundForReservation,
} from "../src/services/creditService.js";
import { cleanupUsers, giveSubscription, insertUser, userId } from "./helpers.js";

const STORE = "credits-store@test.com";
const RESTAURANT = "credits-restaurant@test.com";
const ADMIN = "credits-admin@test.com";

const USER_ACTION = (id: number) => ({ actor: "USER" as const, userId: id });
const SYSTEM = { actor: "SYSTEM" as const, userId: null };

// Sarajevo wall-clock instants. The credit day changes at 01:00 Sarajevo (00:00 London).
const JAN_10 = new Date("2026-01-10T10:00:00+01:00");
const JAN_31 = new Date("2026-01-31T10:00:00+01:00");
const FEB_02 = new Date("2026-02-02T10:00:00+01:00");

// Runs `fn` in a transaction, like the controllers do; rolls back if it throws.
const inTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// For a charge that must fail: the caught error, typed for its body().
const expectedFailure = (): never => {
  throw new Error("The charge should have been refused.");
};

let storeId: number;
let restaurantId: number;
let nextEntityId = 1;
// Charges only need an entity id; the product refund rule looks up reservations by product id.
const freshId = () => 900000 + nextEntityId++;

const ledgerRows = async (id: number) =>
  (await pool.query("SELECT * FROM credit_transactions WHERE user_id = $1 ORDER BY id", [id])).rows;

beforeEach(async () => {
  // No subscription unless the test gives one.
  await insertUser(STORE, "STORE", "Credits Store", null);
  await insertUser(RESTAURANT, "RESTAURANT", "Credits Restaurant", null);
  storeId = await userId(STORE);
  restaurantId = await userId(RESTAURANT);
});

afterEach(async () => {
  await cleanupUsers([STORE, RESTAURANT, ADMIN]);
});

describe("charges", () => {
  it("charges 1 credit and stores the category snapshot", async () => {
    await giveSubscription(storeId, 2, JAN_10);
    const charge = await inTransaction((client) =>
      chargeForProduct(client, storeId, { id: freshId(), category: "Fish" }, JAN_10),
    );
    expect(charge).toMatchObject({ amount: -1, type: "PRODUCT_CHARGE", category: "Fish", period_month: "2026-01-01" });

    const balance = await getBalance(pool, storeId, JAN_10);
    expect(balance).toMatchObject({ total: 2, used: 1, available: 1, hasActiveSubscription: true });
    expect(balance.periodStart).toBe("2026-01-01");
    expect(balance.periodEnd).toBe("2026-01-31");
  });

  it("refuses a charge at 0 credits with a 402 pointing to top-ups", async () => {
    await giveSubscription(storeId, 0, JAN_10);
    const error = await inTransaction((client) =>
      chargeForProduct(client, storeId, { id: freshId(), category: "Meat" }, JAN_10),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InsufficientCreditsError);
    const credits = error as InsufficientCreditsError;
    expect(credits.status).toBe(402);
    expect(credits.body()).toEqual({
      error: "Not enough credits.",
      code: "INSUFFICIENT_CREDITS",
      hasActiveSubscription: true,
      actionUrl: "/my-profile#topup",
    });
    expect(await ledgerRows(storeId)).toHaveLength(0);
  });

  it("refuses a charge without a subscription, pointing to the subscription section", async () => {
    const error = await inTransaction((client) =>
      chargeForReservation(client, restaurantId, { id: freshId(), category: "Meat" }, JAN_10),
    ).then(expectedFailure, (caught: unknown) => caught as InsufficientCreditsError);

    expect(error.body()).toMatchObject({ hasActiveSubscription: false, actionUrl: "/my-profile#subscription" });
  });

  it("never spends credits from a past month", async () => {
    await giveSubscription(storeId, 10, JAN_10);
    const noSubscription = await inTransaction((client) =>
      chargeForProduct(client, storeId, { id: freshId(), category: "Meat" }, FEB_02),
    ).then(expectedFailure, (caught: unknown) => caught as InsufficientCreditsError);
    expect(noSubscription.body()).toMatchObject({ hasActiveSubscription: false });

    await giveSubscription(storeId, 0, FEB_02);
    const empty = await inTransaction((client) =>
      chargeForProduct(client, storeId, { id: freshId(), category: "Meat" }, FEB_02),
    ).then(expectedFailure, (caught: unknown) => caught as InsufficientCreditsError);
    expect(empty.body()).toMatchObject({ hasActiveSubscription: true });
  });

  it("charges a CSV import all or nothing", async () => {
    await giveSubscription(storeId, 2, JAN_10);
    const items = [1, 2, 3].map(() => ({ id: freshId(), category: "Bakery" }));
    await expect(inTransaction((client) => chargeForProducts(client, storeId, items, JAN_10))).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    );
    expect(await ledgerRows(storeId)).toHaveLength(1);

    const charges = await inTransaction((client) => chargeForProducts(client, storeId, items.slice(0, 2), JAN_10));
    expect(charges).toHaveLength(2);
    expect((await getBalance(pool, storeId, JAN_10)).available).toBe(0);
  });

  it("lets exactly one of two parallel charges spend the last credit", async () => {
    await giveSubscription(restaurantId, 1, JAN_10);
    const results = await Promise.allSettled([
      inTransaction((client) => chargeForReservation(client, restaurantId, { id: freshId(), category: "Meat" }, JAN_10)),
      inTransaction((client) => chargeForReservation(client, restaurantId, { id: freshId(), category: "Fish" }, JAN_10)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(InsufficientCreditsError);
    expect((await getBalance(pool, restaurantId, JAN_10)).available).toBe(0);
  });
});

describe("refunds", () => {
  it.each([
    ["winter", "2026-01-14T10:00:00+01:00", "2026-01-15T00:59:00+01:00", "2026-01-15T01:01:00+01:00"],
    ["summer", "2026-07-14T10:00:00+02:00", "2026-07-15T00:59:00+02:00", "2026-07-15T01:01:00+02:00"],
    ["autumn DST switch", "2026-10-24T10:00:00+02:00", "2026-10-25T00:59:00+02:00", "2026-10-25T01:01:00+02:00"],
  ])("refunds a deleted product on the same day only (%s)", async (_, chargedAt, before, after) => {
    const charged = new Date(chargedAt);
    await giveSubscription(storeId, 5, charged);
    const [sameDay, nextDay] = [freshId(), freshId()];
    await inTransaction(async (client) => {
      await chargeForProduct(client, storeId, { id: sameDay, category: "Meat" }, charged);
      await chargeForProduct(client, storeId, { id: nextDay, category: "Meat" }, charged);
    });

    const refunded = await inTransaction((client) => refundForProduct(client, sameDay, USER_ACTION(storeId), new Date(before)));
    expect(refunded.refunded).toBe(true);
    const late = await inTransaction((client) => refundForProduct(client, nextDay, USER_ACTION(storeId), new Date(after)));
    expect(late).toEqual({ refunded: false, reason: "DAY_PASSED" });
  });

  it("keeps the product credit once something was reserved, but ignores rejected reservations", async () => {
    await giveSubscription(storeId, 5);
    const insertProduct = async () =>
      (
        await pool.query<{ id: number }>(
          `INSERT INTO products (store_id, name, category, original_price, discounted_price, quantity, unit, expiry_date)
           VALUES ($1, 'Credit product', 'Meat', 10, 5, 10, 'kg', CURRENT_DATE + 3)
           RETURNING id`,
          [storeId],
        )
      ).rows[0]!.id;
    const reserve = (productId: number, status: string) =>
      pool.query(
        `INSERT INTO reservations (product_id, restaurant_id, quantity, unit_price, status, pickup_date)
         VALUES ($1, $2, 1, 5, $3, NOW())`,
        [productId, restaurantId, status],
      );

    const pending = await insertProduct();
    const rejected = await insertProduct();
    await inTransaction(async (client) => {
      await chargeForProduct(client, storeId, { id: pending, category: "Meat" });
      await chargeForProduct(client, storeId, { id: rejected, category: "Meat" });
    });
    await reserve(pending, "Pending");
    await reserve(rejected, "Rejected");

    expect(await inTransaction((client) => refundForProduct(client, pending, USER_ACTION(storeId)))).toEqual({
      refunded: false,
      reason: "HAS_RESERVATIONS",
    });
    expect((await inTransaction((client) => refundForProduct(client, rejected, USER_ACTION(storeId)))).refunded).toBe(true);
  });

  it("refunds a restaurant's own cancel on the same day only", async () => {
    await giveSubscription(restaurantId, 5, JAN_10);
    const reservationId = freshId();
    await inTransaction((client) => chargeForReservation(client, restaurantId, { id: reservationId, category: "Fish" }, JAN_10));

    const nextDay = new Date("2026-01-11T01:01:00+01:00");
    const result = await inTransaction((client) =>
      refundForReservation(client, reservationId, { forced: false, by: USER_ACTION(restaurantId) }, nextDay),
    );
    expect(result).toEqual({ refunded: false, reason: "DAY_PASSED" });
  });

  it("always refunds a store-rejected or system-cancelled reservation, even days later", async () => {
    await giveSubscription(restaurantId, 5, JAN_10);
    const reservationId = freshId();
    await inTransaction((client) => chargeForReservation(client, restaurantId, { id: reservationId, category: "Fish" }, JAN_10));

    const later = new Date("2026-01-20T12:00:00+01:00");
    const result = await inTransaction((client) => refundForReservation(client, reservationId, { forced: true, by: SYSTEM }, later));
    expect(result.refunded).toBe(true);
    expect(result.refunded && result.transaction).toMatchObject({ amount: 1, type: "RESERVATION_REFUND", actor: "SYSTEM" });
    expect(await getBalance(pool, restaurantId, later)).toMatchObject({ total: 5, used: 0, available: 5 });
  });

  it("puts a refund after a month change into the new month as new credit", async () => {
    await giveSubscription(restaurantId, 5, JAN_31);
    const febSubscription = await giveSubscription(restaurantId, 3, FEB_02);
    const reservationId = freshId();
    await inTransaction((client) => chargeForReservation(client, restaurantId, { id: reservationId, category: "Meat" }, JAN_31));

    const result = await inTransaction((client) => refundForReservation(client, reservationId, { forced: true }, FEB_02));
    expect(result.refunded && result.transaction).toMatchObject({ period_month: "2026-02-01", subscription_id: febSubscription });
    // January keeps its used credit; February gets 3 + 1.
    expect(await getBalance(pool, restaurantId, JAN_31)).toMatchObject({ used: 1 });
    expect(await getBalance(pool, restaurantId, FEB_02)).toMatchObject({ total: 4, used: 0, available: 4 });
  });

  it("holds a refund in a month without a subscription until the user subscribes", async () => {
    await giveSubscription(restaurantId, 5, JAN_31);
    const reservationId = freshId();
    await inTransaction((client) => chargeForReservation(client, restaurantId, { id: reservationId, category: "Meat" }, JAN_31));
    const result = await inTransaction((client) => refundForReservation(client, reservationId, { forced: true }, FEB_02));
    expect(result.refunded && result.transaction.subscription_id).toBeNull();
    expect(await getBalance(pool, restaurantId, FEB_02)).toMatchObject({ total: 1, available: 0, hasActiveSubscription: false });

    await giveSubscription(restaurantId, 3, FEB_02);
    expect((await getBalance(pool, restaurantId, FEB_02)).available).toBe(4);
  });

  it("never refunds the same charge twice", async () => {
    await giveSubscription(restaurantId, 5, JAN_10);
    const reservationId = freshId();
    const charge = await inTransaction((client) =>
      chargeForReservation(client, restaurantId, { id: reservationId, category: "Meat" }, JAN_10),
    );
    expect((await inTransaction((client) => refundForReservation(client, reservationId, { forced: true }, JAN_10))).refunded).toBe(true);
    expect(await inTransaction((client) => refundForReservation(client, reservationId, { forced: true }, JAN_10))).toEqual({
      refunded: false,
      reason: "NO_CHARGE",
    });

    // Even a raw insert cannot refund it again (UNIQUE refunds_transaction_id).
    await expect(
      pool.query(
        `INSERT INTO credit_transactions (user_id, period_month, amount, type, refunds_transaction_id, actor)
         VALUES ($1, '2026-01-01', 1, 'RESERVATION_REFUND', $2, 'SYSTEM')`,
        [restaurantId, charge.id],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await getBalance(pool, restaurantId, JAN_10)).toMatchObject({ used: 0, available: 5 });
  });

  it("does nothing for an entity that was never charged", async () => {
    expect(await inTransaction((client) => refundForProduct(client, freshId(), USER_ACTION(storeId)))).toEqual({
      refunded: false,
      reason: "NO_CHARGE",
    });
  });
});

describe("ledger", () => {
  it("is append-only", async () => {
    await giveSubscription(storeId, 5);
    await expect(pool.query("UPDATE credit_transactions SET amount = 99 WHERE user_id = $1", [storeId])).rejects.toThrow(
      "append-only",
    );
    await expect(pool.query("DELETE FROM credit_transactions WHERE user_id = $1", [storeId])).rejects.toThrow("append-only");
  });
});

describe("grants and adjustments", () => {
  let adminId: number;
  const byAdmin = () => ({ actor: "ADMIN" as const, userId: adminId });

  beforeEach(async () => {
    await insertUser(ADMIN, "ADMIN");
    adminId = await userId(ADMIN);
  });

  it("creates the subscription and grants the plan's credits to its month", async () => {
    const plan = (await pool.query<{ id: number }>("SELECT id FROM plans WHERE name = 'Standard'")).rows[0]!;
    // Approved in January for February: January's balance is untouched.
    const { subscription, transaction } = await inTransaction((client) =>
      grantPlan(client, { userId: storeId, planId: plan.id, periodMonth: "2026-02-01", autoRenew: true, by: byAdmin() }, JAN_31),
    );
    expect(transaction).toMatchObject({ amount: 50, type: "PLAN_GRANT", period_month: "2026-02-01" });
    expect(await getBalance(pool, storeId, JAN_31)).toMatchObject({ hasActiveSubscription: false, total: 0 });
    expect(await getBalance(pool, storeId, FEB_02)).toMatchObject({
      subscription: { id: subscription.id, plan_name: "Standard", auto_renew: true },
      available: 50,
    });

    await expect(
      inTransaction((client) =>
        grantPlan(client, { userId: storeId, planId: plan.id, periodMonth: "2026-02-01", autoRenew: false, by: byAdmin() }, FEB_02),
      ),
    ).rejects.toThrow("The user already has a subscription for this month.");
    await expect(
      inTransaction((client) =>
        grantPlan(client, { userId: storeId, planId: plan.id, periodMonth: "2026-01-01", autoRenew: false, by: byAdmin() }, FEB_02),
      ),
    ).rejects.toThrow("This month has already ended.");
  });

  it("adds a top-up to the current month, and only with an active subscription", async () => {
    const topup = (await pool.query<{ id: number }>("SELECT id FROM topup_packages WHERE credits = 10")).rows[0]!;
    await expect(
      inTransaction((client) => grantTopup(client, { userId: storeId, packageId: topup.id, by: byAdmin() }, JAN_10)),
    ).rejects.toThrow("An active subscription for the current month is required.");

    await giveSubscription(storeId, 5, JAN_10);
    const transaction = await inTransaction((client) =>
      grantTopup(client, { userId: storeId, packageId: topup.id, by: byAdmin() }, JAN_10),
    );
    expect(transaction).toMatchObject({ amount: 10, type: "TOPUP_GRANT", period_month: "2026-01-01" });
    expect((await getBalance(pool, storeId, JAN_10)).available).toBe(15);
  });

  it("adjusts the current month but never below zero", async () => {
    await giveSubscription(storeId, 2, JAN_10);
    await expect(
      inTransaction((client) => adjustCredits(client, { userId: storeId, amount: -3, reason: "Correction", by: byAdmin() }, JAN_10)),
    ).rejects.toThrow("The balance cannot go below zero.");
    await expect(
      inTransaction((client) => adjustCredits(client, { userId: storeId, amount: 1, reason: "  ", by: byAdmin() }, JAN_10)),
    ).rejects.toThrow("A reason is required");

    await inTransaction((client) => adjustCredits(client, { userId: storeId, amount: -2, reason: "Correction", by: byAdmin() }, JAN_10));
    await inTransaction((client) => adjustCredits(client, { userId: storeId, amount: 4, reason: "Goodwill", by: byAdmin() }, JAN_10));
    expect(await getBalance(pool, storeId, JAN_10)).toMatchObject({ total: 4, used: 0, available: 4 });
  });
});
