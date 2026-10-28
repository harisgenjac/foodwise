import fs from "fs";
import path from "path";
import pool from "../config/db.js";
import type { Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { parseId } from "../utils/params.js";
import { CARD_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import type { Role } from "../types/auth.js";
import bcrypt from "bcrypt";
import { hashPassword, validatePassword } from "../utils/accounts.js";
import { CITY_NAME, cityExists, parseCityFilter } from "../utils/cities.js";

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
      `SELECT users.id, users.first_name, users.last_name, users.email, users.role, users.business_name,
         users.logo_url, users.address, users.city_id, cities.name AS city, users.opening_hours,
         users.pickup_hours, users.description, users.phone, users.must_change_password, users.created_at
       FROM users LEFT JOIN cities ON cities.id = users.city_id
       WHERE users.id = $1`,
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
  // An id from the cities list (a number, or a numeric string).
  city_id: unknown;
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
    city_id,
    opening_hours,
    pickup_hours,
    description,
    phone,
  } = fields;
  if (!first_name || !last_name || !business_name || city_id == null || city_id === "" || !address || !phone) {
    return "First name, last name, business name, city, address and phone are required.";
  }
}

const PROFILE_COLUMNS = `id, first_name, last_name, email, role, business_name, logo_url, address, city_id,
  ${CITY_NAME}, opening_hours, pickup_hours, description, phone`;

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
  const cityId = parseId(body.city_id);
  if (cityId === null || !(await cityExists(db, cityId))) {
    return { error: "Invalid city." };
  }
  const {
    first_name,
    last_name,
    business_name,
    logo_url,
    address,
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
       city_id = $6,
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
      cityId,
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
    const { city_id, business_name, favorites } = req.query;
    const page = parsePage(req.query, CARD_PAGE_SIZE);
    if (!page) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    const columns = `users.id, users.business_name, users.city_id, cities.name AS city, users.address, users.logo_url,
     users.description, users.opening_hours, users.pickup_hours, users.phone,
     (SELECT COUNT(*) FROM products
      WHERE products.store_id = users.id
        AND products.status = 'Available'
        AND products.expiry_date >= CURRENT_DATE) AS active_products`;
    let query = `FROM users
     LEFT JOIN cities ON cities.id = users.city_id
     WHERE users.role = 'STORE' AND users.is_blocked = false AND users.business_name IS NOT NULL`;

    let values: (string | number)[] = [];

    // "Favorites only" on the store list: the caller's favorite stores.
    if (favorites !== undefined && favorites !== "") {
      if (favorites !== "true") {
        return res.status(400).json({ error: "Invalid filter." });
      }
      values.push(req.user!.id);
      query += ` AND EXISTS (SELECT 1 FROM favorites WHERE favorites.store_id = users.id AND favorites.restaurant_id = $${values.length})`;
    }

    const cityFilter = await parseCityFilter(pool, city_id);
    if ("invalid" in cityFilter) {
      return res.status(400).json({ error: "Invalid filter." });
    }
    if (cityFilter.cityId !== null) {
      values.push(cityFilter.cityId);
      query += ` AND users.city_id = $${values.length}`;
    }

    if (business_name) {
      values.push(`%${business_name}%` as string);
      query += ` AND users.business_name ILIKE $${values.length}`;
    }

    const { rows, total } = await listPage(
      columns,
      query,
      "users.business_name ASC, users.id DESC",
      values,
      page,
    );

    return res
      .status(200)
      .json({ message: "Stores fetched successfully", stores: rows, total });
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
      `SELECT users.id, users.business_name, users.city_id, cities.name AS city, users.address, users.logo_url,
       users.description, users.opening_hours, users.pickup_hours, users.phone
       FROM users LEFT JOIN cities ON cities.id = users.city_id
       WHERE users.id = $1 AND users.role = 'STORE' AND users.is_blocked = false`,
      [storeId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Store not found." });
    }

    // The store's offers are paged through GET /products?store_id=. Both reservation counts are
    // picked-up (Completed) only: a Confirmed one can still become a missed pickup.
    const stats = await pool.query(
      `SELECT 
     COUNT(DISTINCT id) FILTER (WHERE status = 'Sold') AS sold_articles,
     (SELECT COUNT(*) FROM reservations r JOIN products p ON r.product_id = p.id WHERE p.store_id = $1 AND r.status = 'Completed') AS successful_reservations
   FROM products WHERE store_id = $1`,
      [storeId],
    );

    const myReservations = await pool.query(
      `SELECT COUNT(*) AS my_reservations_count
   FROM reservations r
   JOIN products p ON r.product_id = p.id
   WHERE p.store_id = $1 AND r.restaurant_id = $2 AND r.status = 'Completed'`,
      [storeId, req.user!.id],
    );
    return res.status(200).json({
      message: "Store fetched successfully",
      store: result.rows[0],
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
