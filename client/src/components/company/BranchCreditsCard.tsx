import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Coins } from "lucide-react";
import api from "../../api/axios.js";
import UsageBar from "../credits/UsageBar.js";
import AutoRenewSwitch from "../credits/AutoRenewSwitch.js";
import BranchCreditActions from "./BranchCreditActions.js";
import { formatDisplayDate } from "../../utils/expiry.js";
import { CREDIT_REQUEST_STATUS_STYLES, describeCreditRequest, formatCreditMonth } from "../../utils/credits.js";
import type { CreditRequest, CreditSummary } from "../../types/index.js";

interface BranchCreditsCardProps {
  branchId: number;
  branchName: string;
  deactivated: boolean;
}

// "Krediti i paket" on the headquarters' branch page: this month's plan and balance, next month's
// plan, auto-renew, the open requests and the same two actions as the credits page.
function BranchCreditsCard({ branchId, branchName, deactivated }: BranchCreditsCardProps) {
  const { t } = useTranslation();
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];
  const requestStatuses = t("credits.requestStatuses", { returnObjects: true }) as Record<string, string>;
  const requestTypes = t("credits.requestTypes", { returnObjects: true }) as Record<string, string>;

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/company/branches/${branchId}/credits`, { params: { limit: 1 } });
      setCredits(response.data.credits);
    } catch (err) {
      console.error("Error loading branch credits:", err);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!credits) return null;

  const run = async (request: () => Promise<{ data: { message: string } }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await request();
      toast.success(response.data.message);
      await load();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("company.credits.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const subscription = credits.subscription;
  const withdraw = (request: CreditRequest) =>
    run(() => api.delete(`/company/branches/${branchId}/credits/requests/${request.id}`));

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm" aria-labelledby="branch-credits">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="branch-credits" className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Coins className="h-4 w-4 text-orange-600" />
            {t("company.credits.cardTitle")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("company.credits.period", {
              from: formatDisplayDate(credits.periodStart),
              to: formatDisplayDate(credits.periodEnd),
            })}
          </p>
        </div>
        <BranchCreditActions
          branch={{
            id: branchId,
            name: branchName,
            deactivated,
            hasSubscription: credits.hasActiveSubscription,
            hasNextSubscription: credits.nextSubscription !== null,
            openRequests: credits.pendingRequests,
          }}
          periodStart={credits.periodStart}
          periodEnd={credits.periodEnd}
          onChanged={load}
        />
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-gray-50 p-4">
          <dt className="text-xs font-medium text-gray-500">{t("credits.profile.currentPlan")}</dt>
          <dd className="mt-1 font-semibold text-gray-900">{subscription?.plan_name ?? t("company.credits.noPlan")}</dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-4">
          <dt className="text-xs font-medium text-gray-500">{t("credits.profile.balance")}</dt>
          <dd className="mt-1 font-semibold text-gray-900">
            {t("credits.profile.balanceValue", { available: credits.available, total: credits.total })}
          </dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-4">
          <dt className="text-xs font-medium text-gray-500">{t("company.credits.columnNextMonth")}</dt>
          <dd className="mt-1 font-semibold text-gray-900">
            {credits.nextSubscription?.plan_name ?? t("company.credits.noPlan")}
          </dd>
        </div>
      </dl>
      <UsageBar
        used={credits.used}
        total={credits.total}
        label={t("company.credits.branchUsage", { branch: branchName })}
        className="mt-4"
      />
      {subscription && (
        <div className="mt-4">
          <AutoRenewSwitch
            checked={subscription.auto_renew}
            disabled={busy || deactivated}
            onChange={() =>
              run(() =>
                api.patch(`/company/branches/${branchId}/credits/auto-renew`, { auto_renew: !subscription.auto_renew }),
              )
            }
          />
        </div>
      )}
      {credits.pendingRequests.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {credits.pendingRequests.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center gap-2 text-gray-700">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CREDIT_REQUEST_STATUS_STYLES[request.status]}`}>
                {requestStatuses[request.status] || request.status}
              </span>
              {requestTypes[request.request_type]} · {describeCreditRequest(request, t)} ·{" "}
              {formatCreditMonth(request.period_month, monthNames)}
              {request.status === "PENDING" && (
                <button
                  type="button"
                  onClick={() => withdraw(request)}
                  disabled={busy}
                  className="cursor-pointer text-xs font-medium text-amber-800 hover:underline disabled:opacity-60"
                >
                  {t("credits.profile.withdraw")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default BranchCreditsCard;
