import { formatQuantity, formatPickup, unitLabel } from "./format.js";
import { renderLayout, type EmailLanguage, type RenderedEmail } from "./layout.js";
import { InvalidEmailDataError, type EmailTemplate, type Queryable } from "./types.js";

// To the store: a restaurant sent a reservation request (RESERVATION_CREATED).
export interface ReservationCreatedData {
  reservationId: number;
  productName: string;
  // NUMERIC, kept as the string Postgres returns.
  quantity: string;
  unit: string;
  restaurantName: string | null;
  // Local wall-clock time, YYYY-MM-DDTHH:MI.
  pickupAt: string;
}

const TEXTS = {
  bs: {
    subject: (amount: string, product: string) => `Nova rezervacija: ${amount} ${product}`,
    heading: "Nova rezervacija",
    intro: "Imate novi zahtjev za rezervaciju.",
    product: "Proizvod",
    quantity: "Količina",
    restaurant: "Restoran",
    pickup: "Preuzimanje",
    outro: "Prihvatite ili odbijte rezervaciju u aplikaciji.",
    button: "Otvori rezervaciju",
  },
  en: {
    subject: (amount: string, product: string) => `New reservation: ${amount} ${product}`,
    heading: "New reservation",
    intro: "You have a new reservation request.",
    product: "Product",
    quantity: "Quantity",
    restaurant: "Restaurant",
    pickup: "Pickup",
    outro: "Accept or reject the reservation in the app.",
    button: "Open reservation",
  },
} satisfies Record<EmailLanguage, unknown>;

const parse = (data: unknown): ReservationCreatedData => {
  const value = data as Partial<ReservationCreatedData> | null;
  if (
    !value ||
    typeof value.reservationId !== "number" ||
    typeof value.productName !== "string" ||
    typeof value.quantity !== "string" ||
    typeof value.unit !== "string" ||
    !(typeof value.restaurantName === "string" || value.restaurantName === null) ||
    typeof value.pickupAt !== "string"
  ) {
    throw new InvalidEmailDataError("RESERVATION_CREATED");
  }
  return value as ReservationCreatedData;
};

export const reservationCreated: EmailTemplate = {
  load: async (db: Queryable, event) => {
    if (event.reservationId === null) return null;
    const result = await db.query(
      `SELECT reservations.id, reservations.quantity, products.name AS product_name, products.unit,
              restaurants.business_name AS restaurant_name,
              to_char(reservations.pickup_date, 'YYYY-MM-DD"T"HH24:MI') AS pickup_at
       FROM reservations
       JOIN products ON products.id = reservations.product_id
       JOIN users AS restaurants ON restaurants.id = reservations.restaurant_id
       WHERE reservations.id = $1`,
      [event.reservationId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const data: ReservationCreatedData = {
      reservationId: row.id,
      productName: row.product_name,
      quantity: row.quantity,
      unit: row.unit,
      restaurantName: row.restaurant_name,
      pickupAt: row.pickup_at,
    };
    return data;
  },

  render: (raw: unknown, lang: EmailLanguage, appUrl: string): RenderedEmail => {
    const data = parse(raw);
    const texts = TEXTS[lang];
    const amount = `${formatQuantity(data.quantity, lang)} ${unitLabel(data.unit, lang)}`;
    return renderLayout({
      lang,
      subject: texts.subject(amount, data.productName),
      heading: texts.heading,
      intro: [texts.intro],
      details: [
        { label: texts.product, value: data.productName },
        { label: texts.quantity, value: amount },
        { label: texts.restaurant, value: data.restaurantName ?? "–" },
        { label: texts.pickup, value: formatPickup(data.pickupAt, lang) },
      ],
      outro: [texts.outro],
      button: { label: texts.button, url: `${appUrl}/reservation/${data.reservationId}` },
    });
  },
};
