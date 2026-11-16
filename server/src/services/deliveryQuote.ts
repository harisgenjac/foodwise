import type { Pool, PoolClient } from "pg";
import { getDeliveryProvider } from "../delivery/config.js";
import type { DeliveryLocation, DeliveryProvider } from "../delivery/types.js";
import { isOpenAt, type Schedule } from "../utils/schedule.js";
import { ordersPaused } from "../utils/orderSettings.js";

// Whether an order from a store can be delivered to a restaurant now, and what the provider
// quotes for it (delivery phase 2, the cart's choice). Delivery is always for today, as soon as
// possible: the goods are ready after the store's preparation time, and the store sets the real
// ready time when it accepts. The quote's price is an estimate; the final one comes when the
// delivery is created.

export type DeliveryUnavailableReason =
  | "STORE_NO_DELIVERY" // the store turned delivery off
  | "STORE_PAUSED" // the store paused new orders
  | "STORE_CLOSED" // closed now by its weekly hours
  | "STORE_NO_LOCATION" // no pin on the map
  | "RESTAURANT_NO_LOCATION"
  | "OUT_OF_ZONE" // the provider does not deliver between the two pins
  | "UNAVAILABLE"; // the provider cannot deliver now

export interface DeliveryEstimate {
  price: string;
  estimated_pickup_at: string;
  estimated_delivery_at: string;
}

export type DeliveryOption =
  | { available: true; estimate: DeliveryEstimate; dropoff: DeliveryLocation }
  | { available: false; reason: DeliveryUnavailableReason };

interface Party {
  business_name: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_enabled: boolean;
  paused: boolean;
  opening_schedule: Schedule | null;
  preparation_minutes: number;
}

const loadParty = async (db: Pool | PoolClient, userId: number): Promise<Party | undefined> => {
  const result = await db.query<Party>(
    `SELECT users.business_name, users.address, cities.name AS city, users.phone,
            users.latitude, users.longitude, users.delivery_enabled, ${ordersPaused("users")} AS paused,
            users.opening_schedule, users.preparation_minutes
     FROM users LEFT JOIN cities ON cities.id = users.city_id
     WHERE users.id = $1`,
    [userId],
  );
  return result.rows[0];
};

const location = (party: Party): DeliveryLocation => ({
  name: party.business_name ?? "",
  address: party.address ?? "",
  city: party.city ?? "",
  latitude: party.latitude!,
  longitude: party.longitude!,
  phone: party.phone ?? "",
});

// The delivery address as the order keeps it: "<address>, <city>".
export const deliveryAddressText = (dropoff: DeliveryLocation) =>
  [dropoff.address, dropoff.city].filter(Boolean).join(", ");

// The checks in the order the restaurant can act on them least to most, then the provider's quote
// for goods worth `goodsAmount` KM, ready after the store's preparation time.
export const quoteDelivery = async (
  db: Pool | PoolClient,
  storeId: number,
  restaurantId: number,
  goodsAmount: number,
  { provider = getDeliveryProvider(), now = new Date() }: { provider?: DeliveryProvider; now?: Date } = {},
): Promise<DeliveryOption> => {
  const [store, restaurant] = await Promise.all([loadParty(db, storeId), loadParty(db, restaurantId)]);
  if (!store || !restaurant) return { available: false, reason: "UNAVAILABLE" };
  if (!store.delivery_enabled) return { available: false, reason: "STORE_NO_DELIVERY" };
  if (store.paused) return { available: false, reason: "STORE_PAUSED" };
  if (isOpenAt(store.opening_schedule, now) === false) return { available: false, reason: "STORE_CLOSED" };
  if (store.latitude === null || store.longitude === null) return { available: false, reason: "STORE_NO_LOCATION" };
  if (restaurant.latitude === null || restaurant.longitude === null) {
    return { available: false, reason: "RESTAURANT_NO_LOCATION" };
  }

  const dropoff = location(restaurant);
  const result = await provider.quote({
    pickup: location(store),
    dropoff,
    ready_at: new Date(now.getTime() + store.preparation_minutes * 60 * 1000).toISOString(),
    goods_amount: goodsAmount.toFixed(2),
  });
  if (!result.available) return { available: false, reason: result.code };
  const { price, estimated_pickup_at, estimated_delivery_at } = result.quote;
  return { available: true, estimate: { price, estimated_pickup_at, estimated_delivery_at }, dropoff };
};
