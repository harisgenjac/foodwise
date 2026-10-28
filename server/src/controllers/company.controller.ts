import pool from "../config/db.js";
import type { Request, Response } from "express";
import { BRANCH_COUNT, parseCompanyDescription } from "./adminCompanies.controller.js";
import { removeLogoFile } from "./users.controller.js";

// The company of the signed-in headquarters user (COMPANY role). The name is changed only by an
// admin; the headquarters edits the description and the logo.
const COMPANY_PROFILE_COLUMNS = `companies.id, companies.name, companies.description, companies.logo_url,
  ${BRANCH_COUNT}`;

const toCompany = (row: Record<string, unknown>) => ({ ...row, branch_count: Number(row.branch_count) });

export const getMyCompany = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ${COMPANY_PROFILE_COLUMNS}
       FROM companies JOIN users ON users.company_id = companies.id
       WHERE users.id = $1`,
      [req.user!.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company not found." });
    }
    return res.status(200).json({ message: "Company fetched successfully.", company: toCompany(result.rows[0]) });
  } catch (error) {
    console.error("Error while fetching company:", error);
    return res.status(500).json({ error: "An error occurred while fetching the company." });
  }
};

export const updateMyCompany = async (req: Request, res: Response) => {
  const parsed = parseCompanyDescription(req.body.description);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }
  try {
    const result = await pool.query(
      `UPDATE companies SET description = $1
       FROM users
       WHERE users.id = $2 AND companies.id = users.company_id
       RETURNING ${COMPANY_PROFILE_COLUMNS}`,
      [parsed.description, req.user!.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company not found." });
    }
    return res.status(200).json({ message: "Company profile updated.", company: toCompany(result.rows[0]) });
  } catch (error) {
    console.error("Error while updating company:", error);
    return res.status(500).json({ error: "An error occurred while updating the company." });
  }
};

// Same upload rules as a user's logo (uploadLogoFile); the previous file is deleted.
export const uploadCompanyLogo = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image was uploaded." });
    }
    const logoUrl = `/uploads/logos/${req.file.filename}`;
    const previous = await pool.query(
      `SELECT companies.id, companies.logo_url
       FROM companies JOIN users ON users.company_id = companies.id
       WHERE users.id = $1`,
      [req.user!.id],
    );
    const company = previous.rows[0];
    if (!company) {
      await removeLogoFile(logoUrl);
      return res.status(404).json({ error: "Company not found." });
    }
    const result = await pool.query(
      "UPDATE companies SET logo_url = $1 WHERE companies.id = $2 RETURNING companies.logo_url",
      [logoUrl, company.id],
    );
    await removeLogoFile(company.logo_url);
    return res.status(200).json({ message: "Image uploaded successfully.", logo_url: result.rows[0].logo_url });
  } catch (error) {
    console.error("Error while uploading image:", error);
    return res.status(500).json({ error: "An error occurred while uploading the image." });
  }
};
