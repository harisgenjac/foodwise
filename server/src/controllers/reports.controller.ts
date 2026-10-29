import type { Request, Response } from "express";
import { pickupOwnership } from "./reservations.controller.js";
import { toCsv } from "../utils/csv.js";
import { impactHeaders, parseReportLanguage, salesHeaders } from "../utils/reportLabels.js";
import { impactRows, parsePeriod, salesRows, sendCsv } from "../services/reports.js";

// Picked-up (Completed) reservations in the period: what a store sold or a restaurant bought.
export const getSalesReport = async (req: Request, res: Response) => {
  const { id: userId, role } = req.user!;
  const period = parsePeriod(req.query);
  if (!period) {
    return res.status(400).json({ error: "Invalid period." });
  }
  const lang = parseReportLanguage(req.query.lang);

  try {
    const rows = await salesRows(pickupOwnership(role), userId, period, lang);
    const name = lang === "en" ? (role === "STORE" ? "sales" : "purchases") : role === "STORE" ? "prodaja" : "kupovine";
    return sendCsv(res, name, period, toCsv(salesHeaders(lang, role), rows));
  } catch (error) {
    console.error("Error while generating sales report:", error);
    return res.status(500).json({ error: "An error occurred while generating the report." });
  }
};

// Food saved per month through picked-up reservations.
export const getImpactReport = async (req: Request, res: Response) => {
  const { id: userId, role } = req.user!;
  const period = parsePeriod(req.query);
  if (!period) {
    return res.status(400).json({ error: "Invalid period." });
  }
  const lang = parseReportLanguage(req.query.lang);

  try {
    const rows = await impactRows(pickupOwnership(role), userId, period, lang);
    const name = lang === "en" ? "impact" : "uticaj";
    return sendCsv(res, name, period, toCsv(impactHeaders(lang, role), rows));
  } catch (error) {
    console.error("Error while generating impact report:", error);
    return res.status(500).json({ error: "An error occurred while generating the report." });
  }
};
