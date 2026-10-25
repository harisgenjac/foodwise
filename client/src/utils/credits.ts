import axios from "axios";
import type { TFunction } from "i18next";
import type { CreditRequest, CreditRequestStatus } from "../types/index.js";

// "Standard · 40 credits" for a subscription, "+10 credits" for a top-up.
export const describeCreditRequest = (request: CreditRequest, t: TFunction) =>
  request.request_type === "SUBSCRIPTION"
    ? `${request.plan_name} · ${t("credits.profile.planCredits", { count: request.credits })}`
    : `+${t("credits.profile.creditsCount", { count: request.credits })}`;

export const CREDIT_REQUEST_STATUS_STYLES: Record<CreditRequestStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
  EXPIRED: "bg-gray-100 text-gray-600",
};

// The server's 402 when a product or reservation needs a credit the user does not have.
export interface CreditError {
  hasActiveSubscription: boolean;
  // Where the user can fix it: the subscription or the top-up section of My profile.
  actionUrl: string;
}

export const getCreditError = (err: unknown): CreditError | null => {
  if (!axios.isAxiosError(err) || err.response?.status !== 402) return null;
  const data = err.response.data;
  if (data?.code !== "INSUFFICIENT_CREDITS") return null;
  return {
    hasActiveSubscription: Boolean(data.hasActiveSubscription),
    actionUrl: typeof data.actionUrl === "string" ? data.actionUrl : "/my-profile",
  };
};

// Sections of My profile the banners, notices and links point to (the server's actionUrl too).
export const SUBSCRIPTION_SECTION = "subscription";
export const TOPUP_SECTION = "topup";

// Share of the month's credits used, 0–100 (0 when there are none).
export const usagePercent = (used: number, total: number) =>
  total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;

// Progress bar color: green up to 70%, orange above 70% and below 90%, red from 90%.
export const usageBarColor = (percent: number) =>
  percent >= 90 ? "bg-red-500" : percent > 70 ? "bg-orange-500" : "bg-green-500";

// From this share of used credits on, the banner tells the user how many are left.
export const LOW_CREDITS_PERCENT = 80;

// Credit months change at 00:00 London time, like on the server. As YYYY-MM-01.
export const currentCreditMonth = (now = new Date()) =>
  `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" })
    .format(now)
    .slice(0, 7)}-01`;

// The month after a YYYY-MM-01 month.
export const nextCreditMonth = (month: string) => {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
};

// The last day of a YYYY-MM-01 month as YYYY-MM-DD.
export const creditMonthEnd = (month: string) => {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
};

// "October 2026" with the month names from the dashboard translations (browsers lack Bosnian ones).
export const formatCreditMonth = (month: string, monthNames: string[]) =>
  `${monthNames[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;
