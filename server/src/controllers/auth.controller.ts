import pool from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import {
  hashPassword,
  isUniqueViolation,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "../utils/accounts.js";

interface RegisterBody {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: string;
}
function validateRegFields(fields: RegisterBody) {
  const { first_name, last_name, email, password, role } = fields;
  if (!first_name || !last_name || !email || !password || !role) {
    return "All fields are required.";
  }
  return validateEmail(email) ?? validatePassword(password);
}

// Store, restaurant and admin accounts are created by an admin (POST /api/admin/users).
// Public registration is kept for the planned recipient roles (individuals, public kitchens,
// humanitarian organizations); none of them exists yet, so the list is empty.
const ADMIN_CREATED_ROLES = ["STORE", "RESTAURANT", "ADMIN"];
const PUBLIC_ROLES: string[] = [];

interface LoginBody {
  email: string;
  password: string;
}
function validateLoginFields(fields: LoginBody) {
  const { email, password } = fields;
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return "All fields are required.";
  }
}

export const register = async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, password, role }: RegisterBody =
      req.body ?? {};
    const validationError = validateRegFields(req.body ?? {});

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    if (ADMIN_CREATED_ROLES.includes(role)) {
      return res
        .status(403)
        .json({ error: "Store and restaurant accounts are created by an administrator." });
    }
    if (!PUBLIC_ROLES.includes(role)) {
      return res.status(400).json({ error: "Role is not valid." });
    }

    const email = normalizeEmail(req.body.email);
    const result = await pool.query(
      "SELECT email FROM users WHERE LOWER(email) = $1",
      [email],
    );
    if (result.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "A user with this email already exists." });
    }

    const hashedPassword = await hashPassword(password);

    await pool.query(
      "INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
      [first_name, last_name, email, hashedPassword, role],
    );
    return res.status(201).json({ message: "Registration successful." });
  } catch (error) {
    // Two registrations with the same email at the same moment: the unique index rejects the second.
    if (isUniqueViolation(error)) {
      return res
        .status(400)
        .json({ error: "A user with this email already exists." });
    }
    console.error("Error while registering:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while registering." });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginBody = req.body ?? {};
    const validationError = validateLoginFields(req.body ?? {});

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const result = await pool.query("SELECT * FROM users WHERE LOWER(email) = $1", [
      normalizeEmail(email),
    ]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Incorrect email or password." });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect email or password." });
    }
    if (user.is_blocked) {
      const reason = user.blocked_reason ? ` Reason: ${user.blocked_reason}` : "";
      return res.status(403).json({ error: `Your account is blocked.${reason}` });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful.",
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        must_change_password: user.must_change_password,
      },
    });
  } catch (error) {
    console.error("Error while logging in:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while logging in." });
  }
};

export const logout = (req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  return res.status(200).json({ message: "Logged out successfully." });
};

export const me = (req: Request, res: Response) => {
  return res.status(200).json({ user: req.user });
};
