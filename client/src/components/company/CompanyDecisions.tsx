import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Inbox, X } from "lucide-react";
import BranchCreditActions from "./BranchCreditActions.js";
import BranchRequestDecisionModal from "./BranchRequestDecisionModal.js";
import { describeCreditRequest, formatCreditMonth } from "../../utils/credits.js";
import type { CompanyDashboard, CompanyDecision, CreditRequest } from "../../types/index.js";

interface CompanyDecisionsProps {
  dashboard: CompanyDashboard;
  onChanged: () => void;
}

// "Waiting for your decision" on the headquarters' overview: branch top-ups to approve or reject,
// branches without this (or, in the renewal window, next) month's plan and branches running out
// of credits. Each row has the action it needs, with the dialogs of the Credits page.
function CompanyDecisions({ dashboard, onChanged }: CompanyDecisionsProps) {
  const { t } = useTranslation();
  const [decision, setDecision] = useState<{ request: CreditRequest; action: "approve" | "reject" } | null>(null);
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];

  if (dashboard.decisions.length === 0) return null;

  const need = (item: CompanyDecision) => {
    switch (item.type) {
      case "TOPUP_REVIEW":
        return t("company.overview.topupRequested", {
          credits: describeCreditRequest(item.request, t),
          price: t("credits.profile.price", { price: item.request.price }),
        });
      case "NO_PLAN":
        return t("company.overview.noPlan");
      case "RENEWAL":
        return t("company.overview.renewal", { month: formatCreditMonth(dashboard.nextPeriodStart, monthNames) });
      case "LOW_CREDITS":
        return t("company.overview.lowCredits", { used: item.used, total: item.total });
    }
  };

  const actions = (item: CompanyDecision) => {
    if (item.type === "TOPUP_REVIEW") {
      return (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setDecision({ request: item.request, action: "approve" })}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
          >
            <Check className="h-4 w-4" />
            {t("company.credits.approve")}
          </button>
          <button
            type="button"
            onClick={() => setDecision({ request: item.request, action: "reject" })}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <X className="h-4 w-4" />
            {t("company.credits.reject")}
          </button>
        </div>
      );
    }
    const branch = dashboard.branches.find((row) => row.id === item.branch_id);
    if (!branch) return null;
    return (
      <BranchCreditActions
        compact
        only={item.type === "LOW_CREDITS" ? "topup" : "plan"}
        branch={{
          id: branch.id,
          name: branch.name,
          deactivated: branch.status === "deactivated",
          hasSubscription: branch.has_subscription,
          hasNextSubscription: branch.has_next_subscription,
          openRequests: branch.open_requests,
        }}
        periodStart={dashboard.periodStart}
        periodEnd={dashboard.periodEnd}
        onChanged={onChanged}
      />
    );
  };

  return (
    <section
      className="rounded-2xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm"
      aria-labelledby="company-decisions"
    >
      <h2 id="company-decisions" className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Inbox className="h-5 w-5 text-amber-600" />
        {t("company.overview.decisionsTitle")}
      </h2>
      <p className="mt-1 text-sm text-gray-600">{t("company.overview.decisionsSubtitle")}</p>
      <ul className="mt-4 divide-y divide-amber-100">
        {dashboard.decisions.map((item) => (
          <li
            key={item.type === "TOPUP_REVIEW" ? `topup-${item.request.id}` : `${item.type}-${item.branch_id}`}
            data-testid={`decision-${item.type}-${item.branch_id}`}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="text-sm">
              <Link
                to={`/company/branches/${item.branch_id}`}
                className="font-medium text-gray-900 hover:text-orange-600"
              >
                {item.branch_name}
              </Link>
              <p className="text-gray-600">{need(item)}</p>
            </div>
            {actions(item)}
          </li>
        ))}
      </ul>

      {decision && (
        <BranchRequestDecisionModal
          request={decision.request}
          action={decision.action}
          onClose={() => setDecision(null)}
          onDone={onChanged}
        />
      )}
    </section>
  );
}

export default CompanyDecisions;
