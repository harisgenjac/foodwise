import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Check, CreditCard, History, Inbox, X } from "lucide-react";
import api from "../../api/axios.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadMore from "../../components/LoadMore.js";
import UsageBar from "../../components/credits/UsageBar.js";
import AutoRenewSwitch from "../../components/credits/AutoRenewSwitch.js";
import BranchCreditActions from "../../components/company/BranchCreditActions.js";
import BranchRequestDecisionModal from "../../components/company/BranchRequestDecisionModal.js";
import { usePagedLimit } from "../../hooks/usePagedLimit.js";
import { LIST_PAGE_SIZE } from "../../utils/pagination.js";
import { BRANCH_STATUS_STYLES } from "../../utils/branches.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { formatDateTime } from "../../utils/admin.js";
import {
  CREDIT_REQUEST_STATUS_STYLES,
  describeCreditRequest,
  formatCreditMonth,
} from "../../utils/credits.js";
import type { CompanyBranchCredits, CompanyCredits, CreditRequest } from "../../types/index.js";

const cardStyle = "rounded-2xl border border-gray-100 bg-white p-6 shadow-sm";
const errorMessage = (err: unknown) => (axios.isAxiosError(err) ? err.response?.data?.error : null);

// "Krediti i pretplate": the headquarters asks and pays for its branches' credits. This month's
// totals, one row per branch (plan, usage, next month's plan, auto-renew and the two actions),
// the top-ups the branches asked for and the request history across branches.
function CompanyCreditsPage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<CompanyCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [branchRequests, setBranchRequests] = useState<CreditRequest[]>([]);
  const [history, setHistory] = useState<CreditRequest[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFetching, setHistoryFetching] = useState(false);
  const { limit: historyLimit, loadMore: loadMoreHistory } = usePagedLimit(LIST_PAGE_SIZE);
  const [decision, setDecision] = useState<{ request: CreditRequest; action: "approve" | "reject" } | null>(null);
  const [busy, setBusy] = useState(false);
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const requestStatuses = t("credits.requestStatuses", { returnObjects: true }) as Record<string, string>;
  const requestTypes = t("credits.requestTypes", { returnObjects: true }) as Record<string, string>;

  const loadOverview = useCallback(async () => {
    try {
      const [credits, waiting] = await Promise.all([
        api.get("/company/credits"),
        api.get("/company/credits/branch-requests"),
      ]);
      setOverview(credits.data);
      setBranchRequests(waiting.data.requests);
      setError(false);
    } catch (err) {
      console.error("Error loading company credits:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryFetching(true);
    try {
      const response = await api.get("/company/credits/requests", { params: { limit: historyLimit } });
      setHistory(response.data.requests);
      setHistoryTotal(response.data.total);
    } catch (err) {
      console.error("Error loading credit requests:", err);
    } finally {
      setHistoryFetching(false);
    }
  }, [historyLimit]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const reload = async () => {
    await Promise.all([loadOverview(), loadHistory()]);
  };

  // One action at a time; the server's message (or refusal) is a toast, then a reload.
  const run = async (request: () => Promise<{ data: { message: string } }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await request();
      toast.success(response.data.message);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err) || t("company.credits.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoRenew = (branch: CompanyBranchCredits) =>
    run(() => api.patch(`/company/branches/${branch.id}/credits/auto-renew`, { auto_renew: !branch.auto_renew }));

  const withdraw = (request: CreditRequest) =>
    run(() => api.delete(`/company/branches/${request.user_id}/credits/requests/${request.id}`));

  const header = (
    <ProductPageHeader title={t("company.credits.title")} subtitle={t("company.credits.subtitle")} icon={CreditCard} />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-16">
        {header}
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !overview) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-16">
        {header}
        <LoadErrorState />
      </div>
    );
  }

  const { totals } = overview;
  const tiles = [
    [t("company.credits.totalCredits"), String(totals.total)],
    [t("company.credits.usedCredits"), String(totals.used)],
    [t("company.credits.availableCredits"), String(totals.available)],
    [t("company.credits.branchesWithPlan"), t("company.credits.withPlanValue", { withPlan: totals.withPlan, total: totals.branches })],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      {header}

      <section className={cardStyle} aria-labelledby="company-credits-month">
        <h2 id="company-credits-month" className="text-lg font-bold text-gray-900">
          {t("company.credits.monthTitle", { month: formatCreditMonth(overview.periodStart, monthNames) })}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("company.credits.period", {
            from: formatDisplayDate(overview.periodStart),
            to: formatDisplayDate(overview.periodEnd),
          })}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 p-4">
              <dt className="text-xs font-medium text-gray-500">{label}</dt>
              <dd className="mt-1 text-lg font-bold text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
        <UsageBar
          used={totals.used}
          total={totals.total}
          label={t("company.credits.companyUsage")}
          className="mt-5"
        />
      </section>

      <section className={cardStyle} aria-labelledby="company-credits-branches">
        <h2 id="company-credits-branches" className="text-lg font-bold text-gray-900">
          {t("company.credits.branchesTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">{t("company.credits.branchesSubtitle")}</p>
        {overview.branches.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">{t("company.credits.noBranches")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-3 py-2">{t("company.credits.columnBranch")}</th>
                  <th className="px-3 py-2">{t("company.credits.columnPlan")}</th>
                  <th className="px-3 py-2">{t("company.credits.columnUsage")}</th>
                  <th className="hidden px-3 py-2 md:table-cell">{t("company.credits.columnNextMonth")}</th>
                  <th className="px-3 py-2">{t("company.credits.columnAutoRenew")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.branches.map((branch) => (
                  <tr key={branch.id} className="align-top" data-testid={`branch-credits-${branch.id}`}>
                    <td className="px-3 py-3">
                      <Link to={`/company/branches/${branch.id}`} className="font-medium text-gray-900 hover:text-orange-600">
                        {branch.business_name}
                      </Link>
                      {branch.status !== "active" && (
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${BRANCH_STATUS_STYLES[branch.status]}`}>
                          {t(`company.branchStatus.${branch.status}`)}
                        </span>
                      )}
                      {branch.open_requests.map((request) => (
                        <p key={request.id} className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${CREDIT_REQUEST_STATUS_STYLES[request.status]}`}>
                            {requestStatuses[request.status] || request.status}
                          </span>
                          {requestTypes[request.request_type]} · {describeCreditRequest(request, t)} ·{" "}
                          {formatCreditMonth(request.period_month, monthNames)}
                          {request.status === "PENDING" && (
                            <button
                              type="button"
                              onClick={() => withdraw(request)}
                              disabled={busy}
                              className="cursor-pointer font-medium text-amber-800 hover:underline disabled:opacity-60"
                            >
                              {t("credits.profile.withdraw")}
                            </button>
                          )}
                        </p>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      {branch.has_subscription ? (
                        <span className="font-medium text-gray-800">{branch.plan_name}</span>
                      ) : (
                        <span className="text-gray-400">{t("company.credits.noPlan")}</span>
                      )}
                    </td>
                    <td className="min-w-40 px-3 py-3">
                      <UsageBar
                        used={branch.used}
                        total={branch.total}
                        label={t("company.credits.branchUsage", { branch: branch.business_name })}
                      />
                    </td>
                    <td className="hidden px-3 py-3 text-gray-700 md:table-cell">
                      {branch.next_plan_name ?? <span className="text-gray-400">{t("company.credits.noPlan")}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <AutoRenewSwitch
                        checked={Boolean(branch.auto_renew)}
                        onChange={() => toggleAutoRenew(branch)}
                        disabled={busy || !branch.has_subscription || branch.status === "deactivated"}
                        label={t("company.credits.autoRenewFor", { branch: branch.business_name })}
                        hideLabel
                      />
                    </td>
                    <td className="px-3 py-3">
                      <BranchCreditActions
                        compact
                        branch={{
                          id: branch.id,
                          name: branch.business_name,
                          deactivated: branch.status === "deactivated",
                          hasSubscription: branch.has_subscription,
                          hasNextSubscription: branch.next_plan_name !== null,
                          openRequests: branch.open_requests,
                        }}
                        periodStart={overview.periodStart}
                        periodEnd={overview.periodEnd}
                        onChanged={reload}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={cardStyle} aria-labelledby="company-branch-requests">
        <h2 id="company-branch-requests" className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Inbox className="h-5 w-5 text-orange-600" />
          {t("company.credits.branchRequestsTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">{t("company.credits.branchRequestsSubtitle")}</p>
        {branchRequests.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">{t("company.credits.noBranchRequests")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {branchRequests.map((request) => (
              <li key={request.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-medium text-gray-900">{request.branch_name}</p>
                  <p className="text-gray-600">
                    {describeCreditRequest(request, t)} · {t("credits.profile.price", { price: request.price })} ·{" "}
                    {formatDateTime(request.created_at)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDecision({ request, action: "approve" })}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
                  >
                    <Check className="h-4 w-4" />
                    {t("company.credits.approve")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision({ request, action: "reject" })}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                    {t("company.credits.reject")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cardStyle} aria-labelledby="company-credit-history">
        <h2 id="company-credit-history" className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <History className="h-5 w-5 text-orange-600" />
          {t("company.credits.historyTitle")}
        </h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">{t("company.credits.noHistory")}</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {history.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-gray-700">
                    <span className="font-medium text-gray-900">{request.branch_name}</span> ·{" "}
                    {requestTypes[request.request_type]} {describeCreditRequest(request, t)} ·{" "}
                    {formatCreditMonth(request.period_month, monthNames)}
                    <span className="ml-1 text-xs text-gray-400">({formatDateTime(request.created_at)})</span>
                    {request.company_note && (
                      <span className="block text-xs italic text-gray-500">
                        {t("credits.profile.companyNote", { note: request.company_note })}
                      </span>
                    )}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CREDIT_REQUEST_STATUS_STYLES[request.status]}`}>
                    {requestStatuses[request.status] || request.status}
                  </span>
                </li>
              ))}
            </ul>
            {history.length < historyTotal && (
              <div className="mt-3">
                <LoadMore shown={history.length} total={historyTotal} fetching={historyFetching} onLoadMore={loadMoreHistory} />
              </div>
            )}
          </>
        )}
      </section>

      {decision && (
        <BranchRequestDecisionModal
          request={decision.request}
          action={decision.action}
          onClose={() => setDecision(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}

export default CompanyCreditsPage;
