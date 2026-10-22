import fs from "fs";
import path from "path";
import pool from "../config/db.js";
import type { Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { parseId } from "../utils/params.js";
import type { Role } from "../types/auth.js";
import bcrypt from "bcrypt";
import { hashPassword, validatePassword } from "../utils/accounts.js";

const LOGO_URL_PREFIX = "/uploads/logos/";

// Deletes a replaced logo. Only plain file names under uploads/logos are touched.
const removeLogoFile = async (logoUrl: string | null | undefined) => {
  if (!logoUrl || !logoUrl.startsWith(LOGO_URL_PREFIX)) return;
  const fileName = logoUrl.slice(LOGO_URL_PREFIX.length);
  if (fileName !== path.basename(fileName)) return;
  try {
    await fs.promises.unlink(path.join("uploads", "logos", fileName));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    console.error("Error while deleting old logo:", error);
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      "SELECT id, first_name, last_name, email, role, business_name, logo_url, address, city, opening_hours, pickup_hours, description, phone, must_change_password, created_at FROM users WHERE id = $1",
      [userId],
    );
    return res.status(200).json({ user: result.rows[0] });
  } catch (error) {
    console.error("Error while fetching users:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching users." });
  }
};

export interface UserFields {
  first_name: string;
  last_name: string;
  business_name: string;
  logo_url?: string;
  address?: string;
  city: string;
  opening_hours?: string;
  pickup_hours?: string;
  description?: string;
  phone: string;
}
function validateUserFields(fields: UserFields) {
  const {
    first_name,
    last_name,
    business_name,
    logo_url,
    address,
    city,
    opening_hours,
    pickup_hours,
    description,
    phone,
  } = fields;
  if (!first_name || !last_name || !business_name || !city || !address || !phone) {
    return "First name, last name, business name, city, address and phone are required.";
  }
}

const PROFILE_COLUMNS =
  "id, first_name, last_name, email, role, business_name, logo_url, address, city, opening_hours, pickup_hours, description, phone";

type ProfileResult = { error: string; user?: never } | { user: Record<string, unknown> | undefined; error?: never };

// Shared by PUT /users/me and the admin's PUT /admin/users/:id/profile. An admin has no business
// profile, so only the name changes. Optional fields use COALESCE, so they cannot be cleared.
export const updateProfile = async (
  db: Pool | PoolClient,
  userId: number,
  role: Role,
  body: UserFields,
): Promise<ProfileResult> => {
  if (role === "ADMIN") {
    if (!body.first_name || !body.last_name) {
      return { error: "First and last name are required." };
    }
    const result = await db.query(
      `UPDATE users SET first_name = $1, last_name = $2
       WHERE id = $3
       RETURNING id, first_name, last_name, email, role`,
      [body.first_name, body.last_name, userId],
    );
    return { user: result.rows[0] };
  }

  const validationError = validateUserFields(body);
  if (validationError) {
    return { error: validationError };
  }
  const {
    first_name,
    last_name,
    business_name,
    logo_url,
    address,
    city,
    opening_hours,
    pickup_hours,
    description,
    phone,
  } = body;
  const result = await db.query(
    `UPDATE users SET
       first_name = $1,
       last_name = $2,
       business_name = $3,
       logo_url = COALESCE($4, logo_url),
       address = $5,
       city = $6,
       opening_hours = COALESCE($7, opening_hours),
       pickup_hours = COALESCE($8, pickup_hours),
       description = COALESCE($9, description),
       phone = $10
     WHERE id = $11
     RETURNING ${PROFILE_COLUMNS}`,
    [
      first_name,
      last_name,
      business_name,
      logo_url,
      address,
      city,
      opening_hours,
      pickup_hours,
      description,
      phone,
      userId,
    ],
  );
  return { user: result.rows[0] };
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const result = await updateProfile(pool, req.user!.id, req.user!.role, req.body);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res
      .status(200)
      .json({ message: "Profile updated successfully.", user: result.user });
  } catch (error) {
    console.error("Error while editing user:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while editing the user." });
  }
};

// Any role. Also clears must_change_password, which an admin sets with a temporary password.
export const changePassword = async (req: Request, res: Response) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || typeof current_password !== "string") {
    return res.status(400).json({ error: "All fields are required." });
  }
  try {
    const result = await pool.query<{ password_hash: string }>(
      "SELECT users.password_hash FROM users WHERE users.id = $1",
      [req.user!.id],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(current_password, user.password_hash))) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    const passwordError = validatePassword(new_password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }
    if (new_password === current_password) {
      return res.status(400).json({ error: "The new password must be different from the current one." });
    }
    await pool.query(
      "UPDATE users SET password_hash = $1, must_change_password = false WHERE users.id = $2",
      [await hashPassword(new_password), req.user!.id],
    );
    return res.status(200).json({ message: "Password changed." });
  } catch (error) {
    console.error("Error while changing password:", error);
    return res.status(500).json({ error: "An error occurred while changing the password." });
  }
};

export const getStores = async (req: Request, res: Response) => {
  try {
    const { city, business_name } = req.query;
    let query = `SELECT users.id, users.business_name, users.city, users.address, users.logo_url,
     users.description, users.opening_hours, users.pickup_hours, users.phone,
     (SELECT COUNT(*) FROM products
      WHERE products.store_id = users.id
        AND products.status = 'Available'
        AND products.expiry_date >= CURRENT_DATE) AS active_products
     FROM users
     WHERE users.role = 'STORE' AND users.is_blocked = false AND users.business_name IS NOT NULL`;

    let values = [];

    if (city) {
      values.push(`%${city}%` as string);
      query += ` AND users.city ILIKE $${values.length}`;
    }

    if (business_name) {
      values.push(`%${business_name}%` as string);
      query += ` AND users.business_name ILIKE $${values.length}`;
    }

    query += " ORDER BY users.business_name ASC";
    const result = await pool.query(query, values);

    return res
      .status(200)
      .json({ message: "Stores fetched successfully", stores: result.rows });
  } catch (error) {
    console.error("Error while fetching stores:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching stores." });
  }
};

export const getStoreDetails = async (req: Request, res: Response) => {
  try {
    const storeId = parseId(req.params.id);
    const userRole = req.user!.role;

    if (userRole === "STORE") {
      return res.status(403).json({ error: "You do not have permission for this action." });
    }
    if (storeId === null) {
      return res.status(404).json({ error: "Store not found." });
    }

    const result = await pool.query(
      `SELECT id, business_name, city, address, logo_url, 
       description, opening_hours, pickup_hours, phone 
       FROM users WHERE id = $1 AND role = 'STORE' AND is_blocked = false`,
      [storeId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Store not found." });
    }

    const products = await pool.query(
      `
      SELECT listed.* FROM (
        SELECT
          products.*,
          products.quantity - COALESCE(
            (SELECT SUM(quantity) FROM reservations
             WHERE reservations.product_id = products.id
             AND reservations.status IN ('Pending', 'Confirmed', 'Completed')),
            0
          ) AS available_quantity,
          products.expiry_date - CURRENT_DATE AS days_until_expiry
        FROM products
        WHERE store_id = $1 AND status = 'Available'
        AND expiry_date >= CURRENT_DATE
      ) AS listed
      WHERE listed.available_quantity > 0
      ORDER BY listed.created_at DESC
    `,
      [storeId],
    );

    const stats = await pool.query(
      `SELECT 
     COUNT(DISTINCT id) FILTER (WHERE status = 'Sold') AS sold_articles,
     (SELECT COUNT(*) FROM reservations r JOIN products p ON r.product_id = p.id WHERE p.store_id = $1 AND r.status IN ('Confirmed', 'Completed')) AS successful_reservations
   FROM products WHERE store_id = $1`,
      [storeId],
    );

    const myReservations = await pool.query(
      `SELECT COUNT(*) AS my_reservations_count
   FROM reservations r
   JOIN products p ON r.product_id = p.id
   WHERE p.store_id = $1 AND r.restaurant_id = $2 AND r.status IN ('Confirmed', 'Completed')`,
      [storeId, req.user!.id],
    );
    return res.status(200).json({
      message: "Store fetched successfully",
      store: result.rows[0],
      products: products.rows,
      stats: stats.rows[0],
      myReservations: myReservations.rows[0],
    });
  } catch (error) {
    console.error("Error while fetching store:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching the store." });
  }
};

export const uploadLogo = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image was uploaded." });
    }

    const userId = req.user!.id;
    const logoUrl = `/uploads/logos/${req.file.filename}`;

    const previous = await pool.query(`SELECT logo_url FROM users WHERE id = $1`, [userId]);
    const result = await pool.query(
      `UPDATE users SET logo_url = $1 WHERE id = $2 RETURNING id, logo_url`,
      [logoUrl, userId],
    );
    await removeLogoFile(previous.rows[0]?.logo_url);

    return res.status(200).json({
      message: "Image uploaded successfully.",
      logo_url: result.rows[0].logo_url,
    });
  } catch (error) {
    console.error("Error while uploading image:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while uploading the image." });
  }
};
