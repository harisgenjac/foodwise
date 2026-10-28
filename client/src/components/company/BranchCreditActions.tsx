import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlusCircle, Wallet } from "lucide-react";
import api from "../../api/axios.js";
import Modal from "../product/Modal.js";
import SubscribeModal from "../credits/SubscribeModal.js";
import TopupModal from "../credits/TopupModal.js";
import { formatCreditMonth, nextCreditMonth } from "../../utils/credits.js";
import type { CreditRequest, Plan, TopupPackage } from "../../types/index.js";

// What the actions need to know about a branch's credits this month.
export interface BranchCreditState {
  id: number;
  name: string;
  deactivated: boolean;
  hasSubscription: boolean;
  hasNextSubscription: boolean;
  openRequests: CreditRequest[];
}

interface BranchCreditActionsProps {
  branch: BranchCreditState;
  // The current credit month (YYYY-MM-01) and its last day.
  periodStart: string;
  periodEnd: string;
  onChanged: () => void;
  compact?: boolean;
}

const optionButton =
  "flex cursor-pointer flex-col items-start rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/50";

// The headquarters' two actions for a branch, with the same dialogs and explanation a store gets
// for itself (the branch named in the title): "Choose plan" (this month while there is none,
// otherwise next month's) and "Add credits" (only with this month's plan). Each action first
// lists the plans or packages, then opens the explanation dialog that sends the request.
function BranchCreditActions({ branch, periodStart, periodEnd, onChanged, compact = false }: BranchCreditActionsProps) {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<"plan" | "topup" | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedTopup, setSelectedTopup] = useState<TopupPackage | null>(null);
  const monthNames = t("dashboard.months", { returnObjects: true }) as string[];

  // The plans and packages are loaded when a list opens.
  useEffect(() => {
    if (!picker) return;
    const url = picker === "plan" ? "/company/credits/plans" : "/company/credits/topup-packages";
    api
      .get(url)
      .then((response) => (picker === "plan" ? setPlans(response.data.plans) : setPackages(response.data.packages)))
      .catch((err) => console.error("Error loading plans:", err));
  }, [picker]);

  const period = branch.hasSubscription ? "next" : "current";
  const month = period === "current" ? periodStart : nextCreditMonth(periodStart);
  const planWaiting = branch.openRequests.some(
    (request) => request.request_type === "SUBSCRIPTION" && request.period_month === month,
  );
  const topupWaiting = branch.openRequests.some((request) => request.request_type === "TOPUP");
  const canChoosePlan = !branch.deactivated && !planWaiting && !(period === "next" && branch.hasNextSubscription);
  const canTopup = !branch.deactivated && branch.hasSubscription && !topupWaiting;
  const endpoint = `/company/branches/${branch.id}/credits/requests`;
  const button = `inline-flex cursor-pointer items-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    compact ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm"
  }`;

  const sent = () => {
    setSelectedPlan(null);
    setSelectedTopup(null);
    onChanged();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPicker("plan")}
          disabled={!canChoosePlan}
          title={planWaiting ? t("company.credits.planWaiting") : undefined}
          className={`${button} bg-orange-500 text-white hover:bg-orange-600`}
        >
          <Wallet className="h-4 w-4" />
          {t("company.credits.choosePlan")}
        </button>
        <button
          type="button"
          onClick={() => setPicker("topup")}
          disabled={!canTopup}
          title={topupWaiting ? t("company.credits.topupWaiting") : undefined}
          className={`${button} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
        >
          <PlusCircle className="h-4 w-4" />
          {t("company.credits.addCredits")}
        </button>
      </div>

      {picker === "plan" && (
        <Modal onClose={() => setPicker(null)} labelledBy={`branch-plan-${branch.id}`}>
          <h3 id={`branch-plan-${branch.id}`} className="text-lg font-bold text-gray-900">
            {t("company.credits.pickPlanTitle", { branch: branch.name, month: formatCreditMonth(month, monthNames) })}
          </h3>
          <div className="mt-4 grid gap-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setPicker(null);
                  setSelectedPlan(plan);
                }}
                className={optionButton}
              >
                <span className="font-semibold text-gray-900">{plan.name}</span>
                <span className="text-sm text-gray-600">
                  {t("credits.profile.planCredits", { count: plan.credits_per_period })} ·{" "}
                  {t("credits.profile.price", { price: plan.price })}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {picker === "topup" && (
        <Modal onClose={() => setPicker(null)} labelledBy={`branch-topup-${branch.id}`}>
          <h3 id={`branch-topup-${branch.id}`} className="text-lg font-bold text-gray-900">
            {t("company.credits.pickTopupTitle", { branch: branch.name })}
          </h3>
          <div className="mt-4 grid gap-2">
            {packages.map((topup) => (
              <button
                key={topup.id}
                type="button"
                onClick={() => {
                  setPicker(null);
                  setSelectedTopup(topup);
                }}
                className={optionButton}
              >
                <span className="font-semibold text-gray-900">
                  +{t("credits.profile.creditsCount", { count: topup.credits })}
                </span>
                <span className="text-sm text-green-600">{t("credits.profile.price", { price: topup.price })}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {selectedPlan && (
        <SubscribeModal
          plan={selectedPlan}
          role="STORE"
          period={period}
          month={month}
          monthStarted={new Date().getDate() > 1}
          endpoint={endpoint}
          branchName={branch.name}
          onClose={() => setSelectedPlan(null)}
          onSent={sent}
        />
      )}
      {selectedTopup && (
        <TopupModal
          topup={selectedTopup}
          role="STORE"
          periodEnd={periodEnd}
          endpoint={endpoint}
          branchName={branch.name}
          onClose={() => setSelectedTopup(null)}
          onSent={sent}
        />
      )}
    </>
  );
}

export default BranchCreditActions;
