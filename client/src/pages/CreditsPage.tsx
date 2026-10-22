import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Coins } from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import { useCredits } from "../context/CreditsContext.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import { formatDisplayDate } from "../utils/expiry.js";
import { formatDateTime } from "../utils/admin.js";
import { SUBSCRIPTION_SECTION, usageBarColor, usagePercent } from "../utils/credits.js";
import type { CreditHistory } from "../types/index.js";

// Credits are counted from the month they were introduced.
const FIRST_CREDIT_YEAR = 2026;

type HistoryTab = "month" | "category";

const boxStyle = "rounded-2xl border border-gray-100 bg-white p-6 shadow-sm";

// Stores and restaurants: this month's credits (Box 1) and the usage of a year by month or by
// product category (Box 2).
function CreditsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { credits, loadedAt } = useCredits();
  const currentYear = Number((credits?.periodStart ?? new Date().toISOString()).slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [tab, setTab] = useState<HistoryTab>("month");
  const [history, setHistory] = useState<CreditHistory | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const categories = t("categories", { returnObjects: true }) as Record<string, string>;

  useEffect(() => {
    let cancelled = false;
    setHistoryError(false);
    api
      .get("/credits/me/history", { params: { year } })
      .then((response) => {
        if (!cancelled) setHistory(response.data.history);
      })
      .catch((err) => {
        console.error("Error loading credit history:", err);
        if (!cancelled) setHistoryError(true);
      });
    return () => {
      cancelled = true;
    };
    // The used credits change with every page visit, so the history follows the summary.
  }, [year, credits]);

  if (!credits) return <LoadingSpinner />;

  const percent = usagePercent(credits.used, credits.total);
  const years = Array.from({ length: Math.max(1, currentYear - FIRST_CREDIT_YEAR + 1) }, (_, index) => currentYear - index);
  const categoryTotal = history?.categories.reduce((sum, row) => sum + row.used, 0) ?? 0;
  const usedByCategory = (code: string) =>
    history?.categories
      // Charges without a category (should not happen) count as "Other".
      .filter((row) => (row.category ?? "Other") === code)
      .reduce((sum, row) => sum + row.used, 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader title={t("credits.page.title")} subtitle={t("credits.page.subtitle")} icon={Coins} />

      <section className={boxStyle} aria-labelledby="credits-summary">
        <h2 id="credits-summary" className="text-lg font-bold text-gray-900">
          {t("credits.page.summaryTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t(user?.role === "STORE" ? "credits.page.explanationStore" : "credits.page.explanationRestaurant")}
        </p>

        {!credits.hasActiveSubscription && (
          <p className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("credits.page.noSubscription")}
            <Link
              to={`/my-profile#${SUBSCRIPTION_SECTION}`}
              className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700"
            >
              {t("credits.banner.noneLink")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [t("credits.page.used"), String(credits.used)],
            [t("credits.page.available"), String(credits.available)],
            [t("credits.page.period"), `${formatDisplayDate(credits.periodStart)} – ${formatDisplayDate(credits.periodEnd)}`],
            [t("credits.page.total"), String(credits.total)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 p-4">
              <dt className="text-xs font-medium text-gray-500">{label}</dt>
              <dd className="mt-1 text-lg font-bold text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <div className="mb-1.5 flex justify-end text-sm font-semibold text-gray-700">
            {t("credits.page.usedPercent", { percent: Math.round(percent) })}
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("credits.page.usageLabel")}
            className="h-3 overflow-hidden rounded-full bg-gray-100"
          >
            <div className={`h-full rounded-full ${usageBarColor(percent)}`} style={{ width: `${percent}%` }} />
          </div>
          {loadedAt && (
            <p className="mt-2 text-xs text-gray-500">
              {t("credits.page.lastRefreshed", { time: formatDateTime(loadedAt.toISOString()) })}
            </p>
          )}
        </div>
      </section>

      <section className={boxStyle} aria-labelledby="credits-history">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="credits-history" className="text-lg font-bold text-gray-900">
            {t("credits.page.historyTitle")}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label={t("credits.page.year")}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div role="tablist" className="flex rounded-full border border-gray-200 bg-white p-1">
              {(["month", "category"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    tab === key ? "bg-orange-500 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {t(key === "month" ? "credits.page.byMonth" : "credits.page.byCategory")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {historyError ? (
          <LoadErrorState />
        ) : !history ? (
          <LoadingSpinner />
        ) : tab === "month" ? (
          <>
            <ul className="mt-5 space-y-2.5" aria-label={t("credits.page.byMonth")}>
              {history.months.map((month, index) => {
                // Months without a subscription and future months are grey.
                const inactive = !month.hasSubscription || month.month > credits.periodStart;
                const share = usagePercent(month.used, month.total);
                return (
                  <li key={month.month} className="grid grid-cols-[6.5rem_1fr_5rem] items-center gap-3 text-sm">
                    <span className="text-gray-700">{monthNames[index]}</span>
                    <div
                      data-testid={`month-bar-${index + 1}`}
                      className={`h-3 overflow-hidden rounded-full ${inactive ? "bg-gray-200" : "bg-blue-200"}`}
                    >
                      {!inactive && <div className="h-full bg-blue-800" style={{ width: `${share}%` }} />}
                    </div>
                    <span className="text-right tabular-nums text-gray-700">
                      {inactive ? "—" : `${month.used} / ${month.total}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-800" />
                {t("credits.page.legendUsed")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-200" />
                {t("credits.page.legendUnused")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
                {t("credits.page.legendNone")}
              </span>
            </div>
          </>
        ) : (
          <>
            {categoryTotal === 0 && <p className="mt-4 text-sm text-gray-500">{t("credits.page.noUsage")}</p>}
            <ul className="mt-5 space-y-2.5" aria-label={t("credits.page.byCategory")}>
              {Object.entries(categories).map(([code, label]) => {
                const used = usedByCategory(code);
                return (
                  <li key={code} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="truncate text-gray-700">{label}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                      <div
                        data-testid={`category-bar-${code}`}
                        className="h-full bg-blue-800"
                        style={{ width: `${usagePercent(used, categoryTotal)}%` }}
                      />
                    </div>
                    <span className="text-right tabular-nums text-gray-700">{used}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

export default CreditsPage;
