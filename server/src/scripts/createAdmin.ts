// Creates the first admin account; further accounts are created by an admin in the app.
//
// Usage: npm run create-admin -- <email> <password> [first name] [last name]
import "dotenv/config";
import pool from "../config/db.js";
import {
  hashPassword,
  isUniqueViolation,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "../utils/accounts.js";

async function createAdmin() {
  const [email, password, firstName = null, lastName = null] = process.argv.slice(2);
  const error = !email || !password
    ? "Usage: npm run create-admin -- <email> <password> [first name] [last name]"
    : validateEmail(email) ?? validatePassword(password);
  if (error) {
    console.error(error);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'ADMIN') RETURNING users.id, users.email`,
      [firstName, lastName, normalizeEmail(email!), await hashPassword(password!)],
    );
    console.log(`Admin account created: ${result.rows[0].email} (id ${result.rows[0].id})`);
  } catch (error) {
    if (isUniqueViolation(error)) {
      console.error("A user with this email already exists.");
    } else {
      console.error("Error while creating admin:", error);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createAdmin();
