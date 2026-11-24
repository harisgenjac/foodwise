import type { FulfilmentMethod, ProblemReason, ProblemStatus } from "../types/index.js";

// Problem reports on orders (POST /orders/:id/problems, the admin's "Prijave problema"). The reasons
// a restaurant can choose depend on the order's method (the server checks them the same way).
export const PROBLEM_REASONS: Record<FulfilmentMethod, ProblemReason[]> = {
  DELIVERY: ["LATE", "MISSING_ITEM", "DAMAGED", "COURIER", "PAYMENT", "OTHER"],
  PICKUP: ["PICKUP_TIME", "MISSING_ITEM", "DAMAGED", "STORE", "OTHER"],
};

export const PROBLEM_STATUSES: ProblemStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

export const PROBLEM_STATUS_STYLES: Record<ProblemStatus, string> = {
  OPEN: "bg-warning-50 text-warning-700",
  IN_PROGRESS: "bg-info-50 text-info-700",
  RESOLVED: "bg-success-100 text-success-800",
};

// The most a report's text and the admin's reply can be (the server's limit).
export const PROBLEM_TEXT_MAX = 1000;
