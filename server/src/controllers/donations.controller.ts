import pool from "../config/db.js";
import type { Request, Response } from "express";
import {
  DONATION_STATUSES,
  DONATION_TYPES,
  normalizeDonationFields,
  validateDonationFields,
  validateDonationPrice,
  type DonationFields,
} from "../utils/validateDonation.js";
import { parseId, parseNumber } from "../utils/params.js";
import { markSoldIfFullyConfirmed } from "./reservations.controller.js";
import { HttpError } from "../utils/httpError.js";
import { chargeForProduct, refundForProduct } from "../services/creditService.js";

const DONATION_COLUMNS = `
  donation_offers.id, donation_offers.donor_id, donation_offers.source_product_id,
  donation_offers.donation_type, donation_offers.name, donation_offers.description,
  donation_offers.category, donation_offers.quantity, donation_offers.unit,
  donation_offers.original_price, donation_offers.donation_price, donation_offers.expiry_date,
  donation_offers.pickup_from, donation_offers.pickup_until, donation_offers.allergens,
  donation_offers.serving_temperature, donation_offers.status, donation_offers.created_at,
  donation_offers.updated_at,
  donation_offers.expiry_date - CURRENT_DATE AS days_until_expiry`;

export const createDonation = async (req: Request, res: Response) => {
  const validationError = validateDonationFields(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  const donation = normalizeDonationFields(req.body as DonationFields);

  try {
    const result = await pool.query(
      `INSERT INTO donation_offers (donor_id, donation_type, name, description, category, quantity,
         unit, original_price, donation_price, expiry_date, pickup_from, pickup_until, allergens,
         serving_temperature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${DONATION_COLUMNS}`,
      [
        req.user!.id,
        donation.donation_type,
        donation.name,
        donation.description,
        donation.category,
        donation.quantity,
        donation.unit,
        donation.original_price,
        donation.donation_price,
        donation.expiry_date,
        donation.pickup_from,
        donation.pickup_until,
        donation.allergens,
        donation.serving_temperature,
      ],
    );
    return res
      .status(201)
      .json({ message: "Donation published successfully.", donation: result.rows[0] });
  } catch (error) {
    console.error("Error while creating donation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while creating the donation." });
  }
};

export const getMineDonations = async (req: Request, res: Response) => {
  const { type, status, name } = req.query;
  if (
    (type && !DONATION_TYPES.includes(type as string)) ||
    (status && (status === "Removed" || !DONATION_STATUSES.includes(status as string)))
  ) {
    return res.status(400).json({ error: "Invalid filter." });
  }

  try {
    let query = `SELECT ${DONATION_COLUMNS}
      FROM donation_offers
      WHERE donation_offers.donor_id = $1 AND donation_offers.status != 'Removed'`;
    const values: (string | number)[] = [req.user!.id];

    if (type) {
      values.push(type as string);
      query += ` AND donation_offers.donation_type = $${values.length}`;
    }
    if (status) {
      values.push(status as string);
      query += ` AND donation_offers.status = $${values.length}`;
    }
    if (name) {
      values.push(`%${name as string}%`);
      query += ` AND donation_offers.name ILIKE $${values.length}`;
    }
    query += ` ORDER BY CASE WHEN donation_offers.status = 'Available' THEN 0 ELSE 1 END,
      donation_offers.created_at DESC, donation_offers.id DESC`;

    const result = await pool.query(query, values);
    return res.status(200).json({ donations: result.rows });
  } catch (error) {
    console.error("Error while fetching donations:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching donations." });
  }
};

// Only the donor sees a donation until recipients exist; anyone else gets 404.
export const getDonationById = async (req: Request, res: Response) => {
  const donationId = parseId(req.params.id);
  if (donationId === null) {
    return res.status(404).json({ error: "Donation not found." });
  }
  try {
    const result = await pool.query(
      `SELECT ${DONATION_COLUMNS}
       FROM donation_offers
       WHERE donation_offers.id = $1 AND donation_offers.donor_id = $2
         AND donation_offers.status != 'Removed'`,
      [donationId, req.user!.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Donation not found." });
    }
    return res.status(200).json({ donation: result.rows[0] });
  } catch (error) {
    console.error("Error while fetching donation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching the donation." });
  }
};

const findOwnDonation = async (donationId: number, userId: number) => {
  const result = await pool.query(
    "SELECT donation_offers.donor_id, donation_offers.status FROM donation_offers WHERE donation_offers.id = $1",
    [donationId],
  );
  const donation = result.rows[0];
  if (!donation || donation.status === "Removed") return { error: 404 as const };
  if (donation.donor_id !== userId) return { error: 403 as const };
  return { status: donation.status as string };
};

export const updateDonation = async (req: Request, res: Response) => {
  const donationId = parseId(req.params.id);
  if (donationId === null) {
    return res.status(404).json({ error: "Donation not found." });
  }
  const validationError = validateDonationFields(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }
  const donation = normalizeDonationFields(req.body as DonationFields);

  try {
    const existing = await findOwnDonation(donationId, req.user!.id);
    if (existing.error === 404) {
      return res.status(404).json({ error: "Donation not found." });
    }
    if (existing.error === 403) {
      return res.status(403).json({ error: "You are not allowed to edit this donation." });
    }
    if (existing.status !== "Available") {
      return res.status(400).json({ error: "Only active donations can be edited." });
    }

    const result = await pool.query(
      `UPDATE donation_offers
       SET donation_type = $1, name = $2, description = $3, category = $4, quantity = $5,
           unit = $6, original_price = $7, donation_price = $8, expiry_date = $9,
           pickup_from = $10, pickup_until = $11, allergens = $12, serving_temperature = $13
       WHERE donation_offers.id = $14 AND donation_offers.status = 'Available'
       RETURNING ${DONATION_COLUMNS}`,
      [
        donation.donation_type,
        donation.name,
        donation.description,
        donation.category,
        donation.quantity,
        donation.unit,
        donation.original_price,
        donation.donation_price,
        donation.expiry_date,
        donation.pickup_from,
        donation.pickup_until,
        donation.allergens,
        donation.serving_temperature,
        donationId,
      ],
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Only active donations can be edited." });
    }
    return res
      .status(200)
      .json({ message: "Donation updated successfully.", donation: result.rows[0] });
  } catch (error) {
    console.error("Error while updating donation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while updating the donation." });
  }
};

// Soft delete: donations will later carry claims and payments, so rows are never erased.
export const deleteDonation = async (req: Request, res: Response) => {
  const donationId = parseId(req.params.id);
  if (donationId === null) {
    return res.status(404).json({ error: "Donation not found." });
  }
  try {
    const existing = await findOwnDonation(donationId, req.user!.id);
    if (existing.error === 404) {
      return res.status(404).json({ error: "Donation not found." });
    }
    if (existing.error === 403) {
      return res.status(403).json({ error: "You are not allowed to delete this donation." });
    }
    await pool.query("UPDATE donation_offers SET status = 'Removed' WHERE donation_offers.id = $1", [
      donationId,
    ]);
    return res.status(200).json({ message: "Donation deleted." });
  } catch (error) {
    console.error("Error while deleting donation:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while deleting the donation." });
  }
};

// Moves the unreserved part of a marketplace product into a donation offer. Reserved
// quantity (Pending, Confirmed, Completed) stays with the product and its reservations.
export const donateProduct = async (req: Request, res: Response) => {
  const productId = parseId(req.params.productId);
  if (productId === null) {
    return res.status(404).json({ error: "Product not found." });
  }
  const { donation_type, quantity, donation_price } = req.body ?? {};
  // Without a quantity the whole available amount is donated.
  const hasQuantity = quantity !== undefined && quantity !== null && quantity !== "";
  const requestedQuantity = hasQuantity ? parseNumber(quantity) : null;
  if (hasQuantity && (requestedQuantity === null || requestedQuantity <= 0)) {
    return res.status(400).json({ error: "Quantity must be greater than zero." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // The lock keeps reservations from being created or accepted while the quantity moves.
    const products = await client.query(
      "SELECT *, expiry_date < CURRENT_DATE AS is_expired FROM products WHERE id = $1 FOR UPDATE",
      [productId],
    );
    const product = products.rows[0];
    if (!product || product.status === "Removed") {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found." });
    }
    if (product.store_id !== req.user!.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You are not allowed to donate this product." });
    }
    if (product.status !== "Available" || product.is_expired) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Only available products can be moved to donations." });
    }

    const priceError = validateDonationPrice(donation_type, donation_price, product.original_price);
    if (priceError) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: priceError });
    }

    const reserved = await client.query(
      "SELECT COALESCE(SUM(quantity), 0) AS total_reserved FROM reservations WHERE product_id = $1 AND status IN ('Pending', 'Confirmed', 'Completed')",
      [productId],
    );
    const totalReserved = parseFloat(reserved.rows[0].total_reserved);
    const available = parseFloat(product.quantity) - totalReserved;
    const donatedQuantity = requestedQuantity ?? available;
    if (available <= 0 || donatedQuantity > available) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Not enough product available." });
    }

    const price = donation_type === "SPONSORED" ? parseNumber(donation_price) : null;

    // Moving more of the same product adds to its active donation of the same type and price,
    // so the donor sees one offer instead of one card per move.
    const existing = await client.query(
      `SELECT donation_offers.id FROM donation_offers
       WHERE donation_offers.source_product_id = $1
         AND donation_offers.status = 'Available'
         AND donation_offers.donation_type = $2
         AND donation_offers.donation_price IS NOT DISTINCT FROM $3::decimal
       ORDER BY donation_offers.id
       LIMIT 1
       FOR UPDATE`,
      [product.id, donation_type, price],
    );
    const mergeInto = existing.rows[0]?.id as number | undefined;

    const result = mergeInto
      ? await client.query(
          `UPDATE donation_offers SET quantity = quantity + $1
           WHERE donation_offers.id = $2
           RETURNING ${DONATION_COLUMNS}`,
          [donatedQuantity, mergeInto],
        )
      : await client.query(
          `INSERT INTO donation_offers (donor_id, source_product_id, donation_type, name, description,
             category, quantity, unit, original_price, donation_price, expiry_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING ${DONATION_COLUMNS}`,
          [
            product.store_id,
            product.id,
            donation_type,
            product.name,
            product.description,
            product.category,
            donatedQuantity,
            product.unit,
            product.original_price,
            price,
            product.expiry_date,
          ],
        );

    let creditRefunded = false;
    if (totalReserved === 0 && donatedQuantity === available) {
      // Everything went to donations: the product leaves the marketplace. Like a delete, that
      // gives the credit back on the day it was charged (donations never cost credits). A partial
      // move keeps the product on offer, so its credit stays spent.
      await client.query("UPDATE products SET status = 'Removed' WHERE id = $1", [productId]);
      const refund = await refundForProduct(client, productId, { actor: "USER", userId: req.user!.id });
      creditRefunded = refund.refunded;
    } else {
      const updated = await client.query(
        "UPDATE products SET quantity = quantity - $1 WHERE id = $2 RETURNING *",
        [donatedQuantity, productId],
      );
      await markSoldIfFullyConfirmed(client, updated.rows[0]);
    }

    await client.query("COMMIT");
    if (mergeInto) {
      return res
        .status(200)
        .json({ message: "Quantity added to the existing donation.", donation: result.rows[0], creditRefunded });
    }
    return res
      .status(201)
      .json({ message: "Product moved to donations.", donation: result.rows[0], creditRefunded });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error while moving product to donations:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while moving the product to donations." });
  } finally {
    if (client) client.release();
  }
};

// Undoes "move to donations": the donation's quantity goes back to its source product,
// which is on offer again even if it had been removed or sold out by the move.
export const returnDonationToProduct = async (req: Request, res: Response) => {
  const donationId = parseId(req.params.id);
  if (donationId === null) {
    return res.status(404).json({ error: "Donation not found." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const donations = await client.query(
      `SELECT donation_offers.donor_id, donation_offers.source_product_id, donation_offers.quantity,
         donation_offers.status
       FROM donation_offers WHERE donation_offers.id = $1 FOR UPDATE`,
      [donationId],
    );
    const donation = donations.rows[0];
    if (!donation || donation.status === "Removed") {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Donation not found." });
    }
    if (donation.donor_id !== req.user!.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You are not allowed to edit this donation." });
    }

    // Lock the product so reservations can't change its stock while the quantity comes back.
    const products = donation.source_product_id
      ? await client.query(
          "SELECT id, status, category, expiry_date < CURRENT_DATE AS is_expired FROM products WHERE id = $1 FOR UPDATE",
          [donation.source_product_id],
        )
      : null;
    const product = products?.rows[0];
    if (donation.status !== "Available" || !product) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Only active donations from the offer can be returned." });
    }
    if (product.is_expired) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Product has expired and cannot be returned to the offer." });
    }

    // A Removed product kept its old quantity when everything was moved, so it is rebuilt from
    // what reservations still hold; otherwise the donated amount is simply added back.
    const updated =
      product.status === "Removed"
        ? await client.query(
            `UPDATE products
             SET status = 'Available',
                 quantity = $1::decimal + COALESCE(
                   (SELECT SUM(reservations.quantity) FROM reservations
                    WHERE reservations.product_id = $2
                      AND reservations.status IN ('Pending', 'Confirmed', 'Completed')),
                   0)
             WHERE id = $2 RETURNING *`,
            [donation.quantity, product.id],
          )
        : await client.query(
            "UPDATE products SET quantity = quantity + $1, status = 'Available' WHERE id = $2 RETURNING *",
            [donation.quantity, product.id],
          );
    await client.query("UPDATE donation_offers SET status = 'Removed' WHERE donation_offers.id = $1", [
      donationId,
    ]);
    // A Removed product had left the marketplace, so putting it back is a new publication and
    // costs 1 credit (402 rolls the whole return back). A product that stayed on offer (partial
    // move, or sold out) is still covered by its original credit.
    if (product.status === "Removed") {
      await chargeForProduct(client, req.user!.id, { id: product.id, category: product.category });
    }

    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Donation returned to the offer.", product: updated.rows[0] });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error instanceof HttpError) {
      return res.status(error.status).json(error.body());
    }
    console.error("Error while returning donation to the offer:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while returning the donation to the offer." });
  } finally {
    if (client) client.release();
  }
};
